using System.Text;

namespace Kestrel.Sim;

public static class PortSnapshotCodec
{
    public static string Serialize(GameState state)
    {
        var json = new StringBuilder();
        json.Append('{');
        Field(json, "version", state.Version).Append(',');
        Field(json, "seed", state.Seed).Append(',');
        Field(json, "scenario", state.Scenario).Append(',');
        Field(json, "shipName", state.ShipName).Append(',');
        Field(json, "day", state.Day).Append(',');
        Field(json, "credits", state.Credits).Append(',');
        Field(json, "fuel", state.Fuel).Append(',');
        Field(json, "food", state.Food).Append(',');
        Field(json, "hull", state.Hull).Append(',');
        Field(json, "hullMax", state.HullMax).Append(',');
        Field(json, "prestige", state.Prestige).Append(',');
        Field(json, "engineLevel", state.EngineLevel).Append(',');
        Field(json, "location", state.Location).Append(',');
        Field(json, "docked", state.Docked).Append(',');
        Field(json, "bayCount", state.Ship.BayCount).Append(',');
        json.Append("\"modules\":[");
        for (var i = 0; i < state.Ship.Modules.Count; i++)
        {
            if (i > 0) json.Append(',');
            var module = state.Ship.Modules[i];
            json.Append('{');
            Field(json, "slot", module.Slot).Append(',');
            Field(json, "key", module.Key).Append(',');
            Field(json, "powered", module.Powered).Append(',');
            Field(json, "damaged", module.Damaged).Append(',');
            Field(json, "mark", module.Mark);
            json.Append('}');
        }

        json.Append("],\"crew\":[");
        for (var i = 0; i < state.Crew.Count; i++)
        {
            if (i > 0) json.Append(',');
            var crew = state.Crew[i];
            json.Append('{');
            Field(json, "name", crew.Name).Append(',');
            Field(json, "role", crew.Role);
            json.Append('}');
        }

        json.Append("]}");
        return json.ToString();
    }

    private static StringBuilder Field(StringBuilder json, string name, string value) =>
        json.Append('"').Append(name).Append("\":\"").Append(Escape(value)).Append('"');

    private static StringBuilder Field(StringBuilder json, string name, int value) =>
        json.Append('"').Append(name).Append("\":").Append(value);

    private static StringBuilder Field(StringBuilder json, string name, float value) =>
        json.Append('"').Append(name).Append("\":").Append(value.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));

    private static StringBuilder Field(StringBuilder json, string name, bool value) =>
        json.Append('"').Append(name).Append("\":").Append(value ? "true" : "false");

    private static string Escape(string value) => value.Replace("\\", "\\\\").Replace("\"", "\\\"");
}
