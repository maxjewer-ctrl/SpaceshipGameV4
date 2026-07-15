export type ShipReturnAnchor = "chair" | "airlock";
export type StationReturnAnchor = "airlock" | "market" | "cantina" | "yard";

let shipAnchor: ShipReturnAnchor = "chair";
let stationAnchor: StationReturnAnchor = "airlock";

export function setShipReturnAnchor(anchor: ShipReturnAnchor) { shipAnchor = anchor; }
export function getShipReturnAnchor(): ShipReturnAnchor { return shipAnchor; }
export function setStationReturnAnchor(anchor: StationReturnAnchor) { stationAnchor = anchor; }
export function getStationReturnAnchor(): StationReturnAnchor { return stationAnchor; }
