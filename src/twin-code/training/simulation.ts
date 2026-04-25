/**
 * Twin Code — Training simulation
 * --------------------------------
 * Stand-up / tear-down hooks for a "safe practice" bonded pair the operator
 * can use during training without touching real printers.
 *
 * Implementation note: the existing synthetic generator + multi-printer
 * emulator already cover this. We just wrap them in a clear lifecycle so the
 * stage scripts can call `startTrainingSimulation()` once on stage 1 intro
 * and `stopTrainingSimulation()` once on stage 4 outro — no coupling to the
 * generator's internals leaks into the training content.
 *
 * If we later want to inject specific faults (jet-stop, disconnect,
 * miss-streak) for fault-recovery practice, this is the seam — add an
 * `injectFault('jetStop')` here and surface it as a button inside the
 * fault-recovery stage steps.
 */

import { syntheticGenerator } from '../syntheticGenerator';
import { profilerBus } from '../profilerBus';

let active = false;

export function startTrainingSimulation() {
  if (active) return;
  active = true;
  if (!profilerBus.getSession()) {
    profilerBus.startSession('Training — simulated pair');
  }
  syntheticGenerator.start();
}

export function stopTrainingSimulation() {
  if (!active) return;
  active = false;
  syntheticGenerator.stop();
}

export function isTrainingSimulationActive() {
  return active;
}
