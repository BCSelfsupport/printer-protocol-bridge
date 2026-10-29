import { DROPLET_ML, EVAPORATION_ML_HOUR, type NozzleSize, type Solvent } from '@/lib/fluidUsage';

export interface FluidUsageProfile { nozzle: NozzleSize; solvent: Solvent }
export function loadFluidUsageProfile(storage: Pick<Storage, 'getItem'>, printerId: number): FluidUsageProfile {
  try {
    const profile = JSON.parse(storage.getItem(`codesync-fluid-profile:${printerId}`) ?? 'null');
    if (profile && Object.hasOwn(DROPLET_ML, profile.nozzle) && Object.hasOwn(EVAPORATION_ML_HOUR, profile.solvent)) return profile;
  } catch { /* Invalid stored profiles fall back to editable assumptions. */ }
  return { nozzle: 75, solvent: 'MEK' };
}
export function saveFluidUsageProfile(storage: Pick<Storage, 'setItem'>, printerId: number, profile: FluidUsageProfile) {
  storage.setItem(`codesync-fluid-profile:${printerId}`, JSON.stringify(profile));
}