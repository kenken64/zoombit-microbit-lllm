/*******************************************************************************
 * Functions for ZOOM:BIT Motors and Sensors.
 *
 * Company: Cytron Technologies Sdn Bhd
 * Website: http://www.cytron.io
 * Email:   support@cytron.io
 *******************************************************************************/

// Default motor channel.
const LEFT_MOTOR = MotorChannel.M1;
const RIGHT_MOTOR = MotorChannel.M2;

// Default Maker Line pin.
const MAKER_LINE_PIN = AnalogPin.P1;

// Default ultrasonic sensor pins.
const US_TRIG_PIN = DigitalPin.P2
const US_ECHO_PIN = DigitalPin.P12


// Obtain micro:bit board version 
// Ref: https://support.microbit.org/support/solutions/articles/19000130254-identify-the-version-number-of-the-micro-bit-in-your-program
const board_ver = control.hardwareVersion()

// Tuning for different microbit versions to get a more accurate value in cm
let const_2divspeed = 58
if (board_ver == "1") {
    const_2divspeed = 39
}



// Headlight channel.
enum HeadlightChannel {
    //% block="left"
    Left = DigitalPin.P13,

    //% block="right"
    Right = DigitalPin.P15,

    //% block="all"
    All = 1000,
};

// IO state.
enum DigitalIoState {
    //% block="off"
    Off = 0,

    //% block="on"
    On = 1,
}

// Turn direction.
enum TurnDirection {
    //% block="left"
    Left = 0,

    //% block="right"
    Right = 1
};

// Maker Line position.
enum LinePosition {
    //% block="far left"
    Left2 = 0,

    //% block="left"
    Left1 = 1,

    //% block="center"
    Center = 2,

    //% block="right"
    Right1 = 3,

    //% block="far right"
    Right2 = 4,

    //% block="all"
    All = 5,

    //% block="none"
    None = 6
}



/**
 * Blocks for ZOOM:BIT motors and sensors.
 */
//% weight=11 color=#ff8000 icon="\uf1b9" block="ZOOM:BIT"
//% groups=['Headlights', 'DC Motors', 'Maker Line', 'Ultrasonic']
namespace zoombit {
    
    // Ultrasonic sensor distance.
    let usDistance = 255
    let usFlag = 0

    // Background function to read ultrasonic sensor distance at 200ms interval.
    control.inBackground(function() {
        while(1) {
            if (usFlag == 1) {      // Wait for read ultrasonic command
                // Transmit a pulse.
                pins.digitalWritePin(US_TRIG_PIN, 0)
                control.waitMicros(2)
                pins.digitalWritePin(US_TRIG_PIN, 1)
                control.waitMicros(10)
                pins.digitalWritePin(US_TRIG_PIN, 0)

                // Read the echo.
                // The maximum duration need to add in 20ms of deadzone.
                const pulse = pins.pulseIn(US_ECHO_PIN, PulseValue.High, 255 * const_2divspeed + 20000)

                // No echo detected.
                if (pulse == 0) {
                    usDistance = 255
                }
                else {
                    usDistance = Math.idiv(pulse, const_2divspeed)
                }
                basic.pause(200);   // Recommended minimum time between readings 
                                    // for ultrasonic model RCWL-9610 is 200ms.
            }
            else {
                basic.pause(50);    // Allow the other fibers to run.
            }
        }
    })


    /**
     * Return distance measured by ultrasonic sensor in centimeters (cm).
     * Distance = 1cm - 255cm. Return '255' if distance is > 255cm or no echo is detected.
     */
    //% group="Ultrasonic"
    //% weight=14
    //% blockGap=8
    //% blockId=zoombit_read_ultrasonic
    //% block="ultrasonic distance (cm)"
    export function readUltrasonic(): number {
        if (usFlag == 0) {
            usFlag = 1          // Enable ultrasonic reading in background
            basic.pause(300)
        }
        return usDistance
    }



    // State for headlights.
    let headlightsState = {
        left: 0,
        right: 0
    };


    /**
     * Turn on/off the headlight (On = 1, Off = 0).
     * @param channel Which side of the headlight.
     * @param state Headlight state.
     */
    //% group="Headlights"
    //% weight=30
    //% blockGap=8
    //% blockId=zoombit_set_headlight
    //% block="set %channel headlight to %state"
    //% state.shadow=zoombit_digital_state_picker
    export function setHeadlight(channel: HeadlightChannel, state: number): void {
        // Limit the number.
        state = rekabit.limit(state, 0, 1);

        // Save the pin state.
        switch (channel) {
            case HeadlightChannel.Left: headlightsState.left = state; break;
            case HeadlightChannel.Right: headlightsState.right = state; break;

            case HeadlightChannel.All:
                headlightsState.left = state;
                headlightsState.right = state;
                break;
        }

        // Write to pin.
        pins.digitalWritePin(<number>HeadlightChannel.Left, headlightsState.left);
        pins.digitalWritePin(<number>HeadlightChannel.Right, headlightsState.right);
    }



    /**
     * Toggle the headlight.
     * @param channel Which side of the headlight.
     */
    //% group="Headlights"
    //% weight=29
    //% blockGap=8
    //% blockId=zoombit_toggle_headlight
    //% block="Toggle %channel headlight"
    export function toggleHeadlight(channel: HeadlightChannel): void {
        // Toggle the state.
        switch (channel) {
            case HeadlightChannel.Left: headlightsState.left ^= 1; break;
            case HeadlightChannel.Right: headlightsState.right ^= 1; break;

            case HeadlightChannel.All:
                headlightsState.left ^= 1;
                headlightsState.right ^= 1;
                break;
        }

        // Write to pin.
        pins.digitalWritePin(<number>HeadlightChannel.Left, headlightsState.left);
        pins.digitalWritePin(<number>HeadlightChannel.Right, headlightsState.right);
    }



    /**
     * Get the digital IO state field editor.
     * @param state Digital IO state. eg: DigitalIoState.On
     */
    //% blockHidden=true
    //% colorSecondary="#ff8000"
    //% blockId="zoombit_digital_state_picker"
    //% block="%state"
    export function digitalStatePicker(state: DigitalIoState): number {
        return <number>state;
    }



    /**
     * Brake the motors.
     */
    //% group="DC Motors"
    //% weight=20
    //% blockGap=8
    //% blockId=zoombit_brake
    //% block="brake"
    export function brake(): void {
        rekabit.brakeMotor(MotorChannel.All);
    }



    /**
     * Move forward/backward (Speed = 0-255).
     * @param direction Moving direction.
     * @param speed Moving speed. eg: 128
     */
    //% group="DC Motors"
    //% weight=19
    //% blockGap=8
    //% blockId=zoombit_move
    //% block="move %direction at speed %speed"
    //% speed.min=0 speed.max=255
    export function move(direction: MotorDirection, speed: number): void {
        rekabit.runMotor(LEFT_MOTOR, direction, speed);
        rekabit.runMotor(RIGHT_MOTOR, direction, speed);
    }



    /**
     * Turn left/right (Speed = 0-255).
     * @param direction Turning direction.
     * @param speed Turning speed. eg: 128
     */
    //% group="DC Motors"
    //% weight=18
    //% blockGap=8
    //% blockId=zoombit_turn
    //% block="turn %direction at speed %speed"
    //% speed.min=0 speed.max=255
    export function turn(direction: TurnDirection, speed: number): void {
        if (direction == TurnDirection.Left) {
            rekabit.runMotor(LEFT_MOTOR, MotorDirection.Backward, speed);
            rekabit.runMotor(RIGHT_MOTOR, MotorDirection.Forward, speed);
        }
        else {
            rekabit.runMotor(LEFT_MOTOR, MotorDirection.Forward, speed);
            rekabit.runMotor(RIGHT_MOTOR, MotorDirection.Backward, speed);
        }
    }



    /**
     * Set individual motors speed (speed = -255 to 255, negative value = reverse). 
     * @param leftSpeed Speed for left motor. eg: 0
     * @param rightSpeed Speed for right motor. eg: 0
     */
    //% group="DC Motors"
    //% weight=17
    //% blockGap=8
    //% blockId=zoombit_set_motors_speed
    //% block="set motors speed: left %leftSpeed right %rightSpeed"
    //% leftSpeed.min=-255 leftSpeed.max=255
    //% rightSpeed.min=-255 rightSpeed.max=255
    export function setMotorsSpeed(leftSpeed: number, rightSpeed: number): void {
        let leftDir = MotorDirection.Forward;
        let rightDir = MotorDirection.Forward;

        if (leftSpeed < 0) {
            leftSpeed = -leftSpeed;
            leftDir = MotorDirection.Backward;
        }
        
        if (rightSpeed < 0) {
            rightSpeed = -rightSpeed;
            rightDir = MotorDirection.Backward;
        }

        rekabit.runMotor(LEFT_MOTOR, leftDir, leftSpeed);
        rekabit.runMotor(RIGHT_MOTOR, rightDir, rightSpeed);
    }



    /**
     * Return true if Maker Line is on the selected position. 
     * @param position Check if Maker Line is on this position.
     */
    //% group="Maker Line"
    //% weight=16
    //% blockGap=8
    //% blockId=zoombit_is_line_detected_on
    //% block="line detected on %position"
    //% position.fieldEditor="gridpicker" position.fieldOptions.columns=5
    export function isLineDetectedOn(position: LinePosition): boolean {
        let analogValue = pins.analogReadPin(MAKER_LINE_PIN);

        switch (position) {
            case LinePosition.None:
                if (analogValue < 81) return true;
                else return false;

            case LinePosition.Left2:
                if ((analogValue >= 81) && (analogValue < 266)) return true;
                else return false;

            case LinePosition.Left1:
                if ((analogValue >= 266) && (analogValue < 430)) return true;
                else return false;

            case LinePosition.Center:
                if ((analogValue >= 430) && (analogValue <= 593)) return true;
                else return false;

            case LinePosition.Right1:
                if ((analogValue > 593) && (analogValue <= 757)) return true;
                else return false;

            case LinePosition.Right2:
                if ((analogValue > 757) && (analogValue <= 941)) return true;
                else return false;

            case LinePosition.All:
                if (analogValue > 941) return true;
                else return false;
        }

        return false;
    }



    /**
     * Return the line position detected by Maker Line (-100 to 100, Negative = Left, 0 = Center, Positive = Right).
     */
    //% group="Maker Line"
    //% weight=15
    //% blockGap=8
    //% blockId=zoombit_read_line_position
    //% block="line position"
    export function readLinePosition(): number {
        let analogValue = pins.analogReadPin(MAKER_LINE_PIN);
        
        // Assume line is at center when all or no sensor detects line.
        if ((analogValue < 81) || (analogValue > 941)) return 512;

        // Scale the sensor value to -100 to 100.
        let position = (analogValue - 512) / 4;
        position = rekabit.limit(position, -100, 100);

        return position;
    }

}
