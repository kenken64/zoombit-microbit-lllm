# Cytron ZOOM:BIT Extension for Microsoft MakeCode  
  
[Cytron **ZOOM:BIT** Robot Car Kit for micro:bit](https://www.cytron.io/p-zoombit) comes with a booklet covering 9+1 hands-on building and coding lessons. You will follow the intuitive instructions guide to Build Your Own Robot and explore programming basics in a fun and engaging manner.
  
![ZOOM:BIT](https://raw.githubusercontent.com/CytronTechnologies/pxt-zoombit/master/icon.png)
  
## Educational Resources
Visit [ZOOM:BIT Resource Hub](https://sites.google.com/cytron.io/zoombit-resource-hub/) if you need further assistance with ZOOM:BIT Robot Car Kit and its lessons.
  
  
## Adding the Extension in MakeCode Editor  
* open [https://makecode.microbit.org/](https://makecode.microbit.org/)
* click on **New Project** and give your project a meaningful name
* click on **Extensions** under the gearwheel :gear: menu
* search for '**zoombit**' or "**https://github.com/cytrontechnologies/pxt-zoombit**" 
* click on the zoombit card to install the extension
  
  
# Examples  
## Headlights  

Turn on headlights when button A is pressed, turn off when button B is pressed.

```blocks
input.onButtonPressed(Button.A, function () {
    zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(DigitalIoState.On))
})
input.onButtonPressed(Button.B, function () {
    zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(DigitalIoState.Off))
})
```  
  
## DC Motors

Move robot forward at speed 128 when button A is pressed, brake/stop the robot when button B is pressed.

```blocks
input.onButtonPressed(Button.A, function () {
    zoombit.move(MotorDirection.Forward, 128)
})
input.onButtonPressed(Button.B, function () {
    zoombit.brake()
})
```  
  
## Maker Line Sensor

Show line position on the LED matrix display. Please take note of the position of the micro:bit on ZOOM:BIT robot.

```blocks
basic.forever(function () {
    if (zoombit.isLineDetectedOn(LinePosition.Left2)) {
        basic.showLeds(`
            . . . . #
            . . . . #
            . . . . #
            . . . . #
            . . . . #
            `)
    } else if (zoombit.isLineDetectedOn(LinePosition.Left1)) {
        basic.showLeds(`
            . . . # .
            . . . # .
            . . . # .
            . . . # .
            . . . # .
            `)
    } else if (zoombit.isLineDetectedOn(LinePosition.Center)) {
        basic.showLeds(`
            . . # . .
            . . # . .
            . . # . .
            . . # . .
            . . # . .
            `)
    } else if (zoombit.isLineDetectedOn(LinePosition.Right1)) {
        basic.showLeds(`
            . # . . .
            . # . . .
            . # . . .
            . # . . .
            . # . . .
            `)
    } else if (zoombit.isLineDetectedOn(LinePosition.Right2)) {
        basic.showLeds(`
            # . . . .
            # . . . .
            # . . . .
            # . . . .
            # . . . .
            `)
    } else {
        basic.clearScreen()
    }
})
```  
  
## Ultrasonic Sensor

Show *Heart* when an object is detected less 15cm away from the ultrasonic sensor, otherwise show *Small Heart*

```blocks
basic.forever(function () {
    if (zoombit.readUltrasonic() < 15) {
        basic.showIcon(IconNames.Heart)
    } else {
        basic.showIcon(IconNames.SmallHeart)
    }
})
```  
  
  
## Supported targets
* for PXT/microbit  
  

> Open this page at [https://cytrontechnologies.github.io/pxt-zoombit/](https://cytrontechnologies.github.io/pxt-zoombit/)  
  
  
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
