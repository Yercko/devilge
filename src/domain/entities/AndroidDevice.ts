/**
 * Represents an Android device or emulator visible to ADB.
 * Pure data — no behavior, no infrastructure dependencies.
 */
export interface AndroidDevice {
  readonly serial: string;
  readonly state: DeviceState;
  readonly product?: string;
  readonly model?: string;
  readonly transportId?: string;
}

export type DeviceState =
  | 'device'
  | 'offline'
  | 'unauthorized'
  | 'recovery'
  | 'sideload'
  | 'bootloader'
  | 'unknown';
