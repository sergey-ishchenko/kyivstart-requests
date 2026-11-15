import { Keyboard } from "grammy";
import { BTN } from "./texts.js";

export function mainMenu() {
  return new Keyboard()
    .text(BTN.next)
    .text(BTN.route)
    .row()
    .text(BTN.list)
    .text(BTN.done)
    .row()
    .text(BTN.settings)
    .resized()
    .persistent();
}

export function routeStartMenu(hasHome) {
  const kb = new Keyboard().requestLocation(BTN.myLocation);
  if (hasHome) kb.text(BTN.fromHome);
  return kb.row().text(BTN.back).resized().oneTime();
}

export function locationMenu(label) {
  return new Keyboard().requestLocation(label).row().text(BTN.back).resized().oneTime();
}
