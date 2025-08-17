// Obstacle avoidance demo for ZOOM:BIT
// - Drive forward
// - If an obstacle is closer than 15cm, brake, turn right a bit, then continue
// - Center the ultrasonic sensor servo on S1 at 90°

// Center servo on startup
rekabit.setServoPosition(ServoChannel.S1, 90)

// Re-center with A+B
input.onButtonPressed(Button.AB, function () {
    rekabit.setServoPosition(ServoChannel.S1, 90)
})

input.onButtonPressed(Button.A, function () {
    // Turn on both headlights and start moving when A is pressed
    zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(DigitalIoState.On))
    zoombit.move(MotorDirection.Forward, 120)
})

input.onButtonPressed(Button.B, function () {
    // Brake/stop when B is pressed and turn off both headlights
    zoombit.brake()
    zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(DigitalIoState.Off))
})

basic.forever(function () {
    const d = zoombit.readUltrasonic()
    if (d > 0 && d < 15) {
        // Obstacle detected close by
        zoombit.brake()
        basic.pause(150)
        // Turn right for a short duration
        zoombit.turn(TurnDirection.Right, 140)
        basic.pause(350)
        // Resume forward
        zoombit.move(MotorDirection.Forward, 120)
    }
    basic.pause(50)
})
