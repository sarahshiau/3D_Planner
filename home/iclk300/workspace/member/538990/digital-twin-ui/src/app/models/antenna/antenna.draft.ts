export interface AntennaUpsertDraft {
  antennaID?: number;
  name: string;
  type: string;
  freqStartMHz: number;
  freqEndMHz: number;
  protocol: string;
  port: number;
  model: string;
  manufactor: string;
  property: string;
  sha256sum?: string;
}
