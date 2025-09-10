// Auto-generated headlight control for: light up led when A is pressed then when B is pressed off the led
input.onButtonPressed(Button.A, function () {
  zoombit.setHeadlight(
    HeadlightChannel.All,
    zoombit.digitalStatePicker(DigitalIoState.On),
  );
});

input.onButtonPressed(Button.B, function () {
  zoombit.setHeadlight(
    HeadlightChannel.All,
    zoombit.digitalStatePicker(DigitalIoState.Off),
  );
});
