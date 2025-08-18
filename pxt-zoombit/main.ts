function setup() {
  // Initialize the zoombit
  zoombit.init();
}

function loop() {
  // Auto-generated headlight control for: turn on headlight when A is pressed
  if (input.buttonIsPressed(Button.A)) {
    zoombit.setHeadlight(
      zoombit.HeadlightChannel.All,
      zoombit.digitalStatePicker(zoombit.DigitalIoState.On),
    );
  } else {
    zoombit.setHeadlight(
      zoombit.HeadlightChannel.All,
      zoombit.digitalStatePicker(zoombit.DigitalIoState.Off),
    );
  }
}

setup();
basic.forever(() => loop());
