export interface CommittedMapData {
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  zoom: number;
  provider: 'osm';
  committedAtISO: string;
}
