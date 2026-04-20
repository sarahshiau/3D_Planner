import { AntennaApiDto } from '../models/antenna/antenna.api.dto';

export const MOCK_ANTENNAS: AntennaApiDto[] = [
  {
    antennaID: 1,
    antennaType: 'Omnidirectional',
    antennaName: 'ITRI_omnidirectional_antenna_FR1',
    model: 'ITRI_FR1',
    manufactor: 'ITRI',
    band: [410, 7125],
    protocol: '5G',
    property: 'default',
    user: 'default',
    availableFrequencies: [
      {
        frequency: 3800,
        frequencyId: 1,
        ports: [
          {
            portId: 1,
            portName: 'itri_FR1_port',
            portGain: 0,
          },
        ],
      },
    ],
  },
  {
    antennaID: 2,
    antennaType: 'Omnidirectional',
    antennaName: 'ITRI_omnidirectional_antenna_FR2',
    model: 'ITRI_FR2',
    manufactor: 'ITRI',
    band: [24250, 71000],
    protocol: '5G',
    property: 'default',
    user: 'default',
    availableFrequencies: [
      {
        frequency: 47500,
        frequencyId: 2,
        ports: [
          {
            portId: 2,
            portName: 'itri_FR2_port',
            portGain: 0,
          },
        ],
      },
    ],
  },
  {
    antennaID: 12,
    antennaType: 'Directional',
    antennaName: 'test_problem',
    model: '123',
    manufactor: '123',
    band: [4850, 4850],
    protocol: '5G',
    property: 'customized',
    user: 'ydhuang',
    availableFrequencies: [
      {
        frequency: null,
        frequencyId: null,
        ports: [
          {
            portId: 38,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 39,
            portName: 'port1',
            portGain: 12.7,
          },
          {
            portId: 40,
            portName: 'port3',
            portGain: 12.5,
          },
          {
            portId: 41,
            portName: 'port2',
            portGain: 13.3,
          },
        ],
      },
      {
        frequency: 4850,
        frequencyId: 26,
        ports: [
          {
            portId: 42,
            portName: 'port1',
            portGain: 12.7,
          },
          {
            portId: 43,
            portName: 'port2',
            portGain: 13.3,
          },
          {
            portId: 44,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 45,
            portName: 'port3',
            portGain: 12.5,
          },
        ],
      },
    ],
  },
  {
    antennaID: 13,
    antennaType: 'Directional',
    antennaName: '新的',
    model: 'asdf',
    manufactor: 'sdf',
    band: [1500, 60000],
    protocol: '5G',
    property: 'customized',
    user: 'ydhuang',
    availableFrequencies: [
      {
        frequency: 3500,
        frequencyId: 27,
        ports: [
          {
            portId: 46,
            portName: 'PegaTest',
            portGain: 6.974,
          },
        ],
      },
    ],
  },
  {
    antennaID: 27,
    antennaType: 'Directional',
    antennaName: 'dadfa',
    model: 'asdfas',
    manufactor: 'dafs',
    band: [4850, 4850],
    protocol: 'Wi-Fi',
    property: 'default',
    user: 'default',
    availableFrequencies: [
      {
        frequency: 4850,
        frequencyId: 41,
        ports: [
          {
            portId: 87,
            portName: 'port2',
            portGain: 13.3,
          },
          {
            portId: 88,
            portName: 'port3',
            portGain: 12.5,
          },
          {
            portId: 86,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 85,
            portName: 'port1',
            portGain: 12.7,
          },
        ],
      },
    ],
  },
  {
    antennaID: 46,
    antennaType: 'Directional',
    antennaName: '000',
    model: '000',
    manufactor: '000',
    band: [4850, 4850],
    protocol: '5G',
    property: 'customized',
    user: 'ydhuang',
    availableFrequencies: [
      {
        frequency: 4850,
        frequencyId: 60,
        ports: [
          {
            portId: 161,
            portName: 'port1',
            portGain: 12.7,
          },
          {
            portId: 162,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 163,
            portName: 'port3',
            portGain: 12.5,
          },
          {
            portId: 164,
            portName: 'port2',
            portGain: 13.3,
          },
        ],
      },
    ],
  },
  {
    antennaID: 47,
    antennaType: 'Directional',
    antennaName: '001',
    model: '000',
    manufactor: '000',
    band: [4850, 4850],
    protocol: '5G',
    property: 'customized',
    user: 'ydhuang',
    availableFrequencies: [
      {
        frequency: 4850,
        frequencyId: 61,
        ports: [
          {
            portId: 165,
            portName: 'port1',
            portGain: 12.7,
          },
          {
            portId: 166,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 167,
            portName: 'port2',
            portGain: 13.3,
          },
          {
            portId: 168,
            portName: 'port3',
            portGain: 12.5,
          },
        ],
      },
    ],
  },
  {
    antennaID: 48,
    antennaType: 'Directional',
    antennaName: '002',
    model: '000',
    manufactor: '000',
    band: [4500, 5445],
    protocol: '5G',
    property: 'customized',
    user: 'ydhuang',
    availableFrequencies: [
      {
        frequency: 4850,
        frequencyId: 62,
        ports: [
          {
            portId: 169,
            portName: 'port1',
            portGain: 12.7,
          },
          {
            portId: 170,
            portName: 'port3',
            portGain: 12.5,
          },
          {
            portId: 171,
            portName: 'port4',
            portGain: 13.3,
          },
          {
            portId: 172,
            portName: 'port2',
            portGain: 13.3,
          },
        ],
      },
    ],
  },
];
