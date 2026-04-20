export interface PortDto {
  portId: number;
  portName: string;
  portGain: number;
}

export interface AvailableFrequencyDto {
  frequency: number | null;
  frequencyId?: number | null;
  ports: PortDto[];
}

export interface AntennaApiDto {
  antennaID: number;
  antennaType: string;
  antennaName: string;
  model: string;
  manufactor: string;
  band: [number, number];
  protocol: string;
  property: string;
  user?: string;
  availableFrequencies?: AvailableFrequencyDto[];
}
