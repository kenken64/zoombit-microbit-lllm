# hello world

## basic.showString

```typescript
basic.showString("Hello!")
```
Displays the text "Hello!" scrolling across the micro:bit's 5×5 LED matrix.

## basic.forever

```typescript
basic.forever(function () {
    // your repeating logic here
})
```
Runs the provided function repeatedly in the background; use this for continuous behavior.

---

# button handlers — RGB pixels demo (Rekabit)

## input.onButtonPressed (Button.A) — random colors on pixels 0 and 1

```typescript
input.onButtonPressed(Button.A, function () {
    rekabit.setRgbBrightness(25)
    while (true) {
        rekabit.setRgbPixelColor(0, rekabit.rgb(randint(1, 255), randint(1, 255), randint(1, 255)))
        basic.pause(100)
        rekabit.setRgbPixelColor(1, rekabit.rgb(randint(1, 255), randint(1, 255), randint(1, 255)))
    }
})
```
On A press, sets RGB brightness to 25 then continuously assigns random colors to pixels 0 and 1 (100 ms between pixel updates).

## input.onButtonPressed (Button.AB)

```typescript
input.onButtonPressed(Button.AB, function () {
    
})
```
Placeholder for combined A+B behavior.

## input.onButtonPressed (Button.B) — clear all pixels

```typescript
input.onButtonPressed(Button.B, function () {
    rekabit.clearAllRgbPixels()
})
```
On B press, clears all Rekabit RGB pixels (turns them off).

## basic.forever

```typescript
basic.forever(function () {
    
})
```
Idle loop for continuous behaviors (none added here).

## basic.showIcon

```typescript
basic.showIcon(IconNames.Heart)
basic.showIcon(IconNames.SmallHeart)
```
Shows built‑in icons on the LED matrix; here a large heart followed by a small heart.

## basic.showLeds

```typescript
basic.showLeds(`
    # . . . #
    . # . # .
    . . # . .
    . # . # .
    # . . . #
    `)
```
Displays a custom 5×5 LED bitmap; this pattern lights the corners, diagonals and center.

```typescript
basic.showLeds(`
    # # # # #
    # . . . #
    # . . . #
    # . . . #
    # # # # #
    `)
```
Draws a solid border (a lit square frame) on the LED matrix.

## basic.pause

```typescript
basic.pause(100)
```
Pauses execution for 100 milliseconds.

## basic.showNumber

```typescript
basic.showNumber(7)
```
Shows the number 7 on the LED display.

## basic.clearScreen

```typescript
basic.clearScreen()
```
Clears the LED matrix (turns all pixels off).

## basic.showArrow

```typescript
basic.showArrow(ArrowNames.North)
basic.showArrow(ArrowNames.NorthEast)
basic.showArrow(ArrowNames.East)
basic.showArrow(ArrowNames.SouthEast)
basic.showArrow(ArrowNames.South)
basic.showArrow(ArrowNames.SouthWest)
basic.showArrow(ArrowNames.SouthWest)
basic.showArrow(ArrowNames.West)
basic.showArrow(ArrowNames.NorthWest)
```
Displays arrows pointing in each compass direction; one call per direction.



---

# button handlers — music demo

## input.onButtonPressed (Button.A)

### music.play with tonePlayable and beat

```typescript
input.onButtonPressed(Button.A, function () {
    music.play(
        music.tonePlayable(294, music.beat(BeatFraction.Whole) + 3),
        music.PlaybackMode.UntilDone
    )
    music.play(
        music.tonePlayable(392, music.beat(BeatFraction.Double)),
        music.PlaybackMode.UntilDone
    )
    music.play(
        music.tonePlayable(784, music.beat(BeatFraction.Double)),
        music.PlaybackMode.UntilDone
    )
})
```
When A is pressed, plays three tones sequentially (294 Hz, 392 Hz, 784 Hz) for the specified beat lengths; each call blocks until the tone finishes.

### looped sequence

```typescript
input.onButtonPressed(Button.A, function () {
    for (let index = 0; index < 2; index++) {
        music.play(music.tonePlayable(523, music.beat(BeatFraction.Whole) + 3), music.PlaybackMode.UntilDone)
        music.play(music.tonePlayable(494, music.beat(BeatFraction.Whole) + 3), music.PlaybackMode.UntilDone)
        music.play(music.tonePlayable(440, music.beat(BeatFraction.Whole) + 3), music.PlaybackMode.UntilDone)
        music.play(music.tonePlayable(784, music.beat(BeatFraction.Double)), music.PlaybackMode.UntilDone)
        music.play(music.tonePlayable(587, music.beat(BeatFraction.Whole)), music.PlaybackMode.UntilDone)
    }
})
```
Repeats the phrase twice: three descending tones (523, 494, 440 Hz), a long 784 Hz tone, then 587 Hz for one beat.

### ending phrase

```typescript
input.onButtonPressed(Button.A, function () {
    music.play(music.tonePlayable(523, music.beat(BeatFraction.Whole) + 3), music.PlaybackMode.UntilDone)
    music.play(music.tonePlayable(494, music.beat(BeatFraction.Whole) + 3), music.PlaybackMode.UntilDone)
    music.play(music.tonePlayable(440, music.beat(BeatFraction.Double)), music.PlaybackMode.UntilDone)
})
```
Finishes with a short closing phrase of three tones (523 → 494 → 440 Hz).

## input.onButtonPressed (Button.B)

### music.stringPlayable

```typescript
input.onButtonPressed(Button.B, function () {
    music.play(music.stringPlayable("- - - - - - - - ", 120), music.PlaybackMode.UntilDone)
})
```
On B press, plays a string‑defined rhythm at 120 bpm; '-' characters represent rests.

### music.ringTone

```typescript
input.onButtonPressed(Button.B, function () {
    music.ringTone(262)
})
```
Starts a continuous 262 Hz tone (until changed or stopped).

### music.setVolume

```typescript
input.onButtonPressed(Button.B, function () {
    music.setVolume(127)
})
```
Sets the audio output volume to 127 on a 0–255 scale (about 50%).

### music.stopAllSounds

```typescript
input.onButtonPressed(Button.B, function () {
    music.stopAllSounds()
})
```
Stops any tones, melodies, or sound expressions currently playing.

### music.changeTempoBy

```typescript
input.onButtonPressed(Button.B, function () {
    music.changeTempoBy(20)
})
```
Increases the current tempo by 20 beats per minute.

### background melody (built-in)

```typescript
input.onButtonPressed(Button.B, function () {
    music._playDefaultBackground(
        music.builtInPlayableMelody(Melodies.Dadadadum),
        music.PlaybackMode.InBackground
    )
})
```
Starts the built‑in "Dadadadum" melody in the background (non‑blocking).

### music.createSoundExpression

```typescript
input.onButtonPressed(Button.B, function () {
    music.play(
        music.createSoundExpression(
            WaveShape.Sine,
            5000, // start frequency
            0,    // end frequency
            255,  // start volume
            0,    // end volume
            500,  // duration ms
            SoundExpressionEffect.None,
            InterpolationCurve.Linear
        ),
        music.PlaybackMode.UntilDone
    )
})
```
Plays a sine‑wave sound expression sweeping from 5 kHz down to 0 Hz over 500 ms while fading volume 255 → 0; blocks until completion.

## basic.forever

```typescript
basic.forever(function () {
    // idle loop
})
```
Background loop for any ongoing checks or animations.

---

# auto headlight — light sensor

## basic.showIcon

```typescript
basic.showIcon(IconNames.Heart)
```
Shows a heart icon at startup.

## basic.forever + input.lightLevel

```typescript
basic.forever(function () {
    if (input.lightLevel() < 50) {
        // turn headlights ON when it's dark
        zoombit.setHeadlight(
            HeadlightChannel.All,
            zoombit.digitalStatePicker(DigitalIoState.On)
        )
    } else {
        // turn headlights OFF when it's bright
        zoombit.setHeadlight(
            HeadlightChannel.All,
            zoombit.digitalStatePicker(DigitalIoState.Off)
        )
    }
})
```
Continuously reads the ambient light level (0–255) and turns Zoombit headlights ON below 50, otherwise OFF.

## zoombit.setHeadlight (usage)

```typescript
// ON
zoombit.setHeadlight(
    HeadlightChannel.All,
    zoombit.digitalStatePicker(DigitalIoState.On)
)

// OFF
zoombit.setHeadlight(
    HeadlightChannel.All,
    zoombit.digitalStatePicker(DigitalIoState.Off)
)
```
Controls Zoombit headlights: select channels (here All) and set their digital state to On or Off.

---

# button handlers — movement demo

## input.onButtonPressed (Button.A) — turn right then brake

```typescript
input.onButtonPressed(Button.A, function () {
    zoombit.turn(TurnDirection.Right, 128)
    basic.pause(500)
    zoombit.brake()
})
```
On A press, turns Zoombit to the right at speed 128 for 500 ms, then applies the brake to stop.

## input.onButtonPressed (Button.AB) — move forward then brake

```typescript
input.onButtonPressed(Button.AB, function () {
    zoombit.move(MotorDirection.Forward, 128)
    basic.pause(1000)
    zoombit.brake()
})
```
On A+B press, drives Zoombit forward at speed 128 for 1 second, then brakes to stop.

## input.onButtonPressed (Button.B) — turn right then brake

```typescript
input.onButtonPressed(Button.B, function () {
    zoombit.turn(TurnDirection.Right, 128)
    basic.pause(500)
    zoombit.brake()
})
```
On B press, performs the same right turn at speed 128 for 500 ms, then brakes.

## basic.forever

```typescript
basic.forever(function () {
    
})
```
Idle loop available for continuous checks or behaviors (empty here).

---

# button handlers — motor speed demo

## input.onButtonPressed (Button.A) — setMotorsSpeed

```typescript
input.onButtonPressed(Button.A, function () {
    zoombit.setMotorsSpeed(100, 150)
})
```
On A press, sets the two motor speeds to 100 and 150 (0–255 scale). Unequal speeds will make the robot arc/turn.

## input.onButtonPressed (Button.AB)

```typescript
input.onButtonPressed(Button.AB, function () {
    
})
```
Placeholder for combined A+B behavior.

## input.onButtonPressed (Button.B)

```typescript
input.onButtonPressed(Button.B, function () {
    
})
```
Placeholder for B button behavior.

## basic.forever

```typescript
basic.forever(function () {
    
})
```
Idle loop for continuous behaviors (none added here).



