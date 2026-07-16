using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Kestrel.Sim;

public static class SaveCodec
{
    public static string Serialize(GameState state)
    {
        Validate(state);
        var json = new StringBuilder();
        json.Append('{');
        Number(json, "version", state.Version).Append(',');
        Number(json, "seed", state.Seed).Append(',');
        String(json, "scenario", state.Scenario).Append(',');
        String(json, "shipName", state.ShipName).Append(',');
        Number(json, "day", state.Day).Append(',');
        Number(json, "credits", state.Credits).Append(',');
        Number(json, "fuel", state.Fuel).Append(',');
        Number(json, "food", state.Food).Append(',');
        Number(json, "hull", state.Hull).Append(',');
        Number(json, "hullMax", state.HullMax).Append(',');
        Number(json, "prestige", state.Prestige).Append(',');
        Number(json, "engineLevel", state.EngineLevel).Append(',');
        String(json, "location", state.Location).Append(',');
        Boolean(json, "docked", state.Docked).Append(',');
        json.Append("\"ship\":{");
        String(json, "hull", state.Ship.Hull).Append(',');
        Number(json, "bayCount", state.Ship.BayCount).Append(',');
        json.Append("\"modules\":[");
        AppendList(json, state.Ship.Modules, AppendModule);
        json.Append("]},\"crew\":[");
        AppendList(json, state.Crew, AppendCrew);
        json.Append("],\"offers\":[");
        AppendList(json, state.Offers, AppendContract);
        json.Append("],\"jobs\":[");
        AppendList(json, state.Jobs, AppendContract);
        json.Append("],\"travel\":");
        if (state.Travel == null) json.Append("null");
        else AppendTravel(json, state.Travel);
        json.Append(",\"log\":[");
        for (var i = 0; i < state.Log.Count; i++)
        {
            if (i > 0) json.Append(',');
            Quote(json, state.Log[i]);
        }
        json.Append("]}");
        return json.ToString();
    }

    public static GameState Deserialize(string json)
    {
        var root = SimpleJson.ParseObject(json);
        var state = new GameState
        {
            Version = Int(root, "version"),
            Seed = Int(root, "seed"),
            Scenario = Text(root, "scenario"),
            ShipName = Text(root, "shipName"),
            Day = Int(root, "day"),
            Credits = Int(root, "credits"),
            Fuel = Float(root, "fuel"),
            Food = Int(root, "food"),
            Hull = Int(root, "hull"),
            HullMax = Int(root, "hullMax"),
            Prestige = Int(root, "prestige"),
            EngineLevel = Int(root, "engineLevel"),
            Location = Text(root, "location"),
            Docked = Bool(root, "docked")
        };

        if (state.Version > GameState.CurrentVersion)
            throw new InvalidOperationException($"Save version {state.Version} is newer than this build supports.");
        state.Version = GameState.CurrentVersion;

        var ship = Object(root, "ship");
        state.Ship = new ShipState { Hull = Text(ship, "hull"), BayCount = Int(ship, "bayCount") };
        foreach (var value in Array(ship, "modules"))
        {
            var module = Object(value, "module");
            state.Ship.Modules.Add(new ModuleState
            {
                Slot = Int(module, "slot"), Key = Text(module, "key"), Powered = Bool(module, "powered"),
                Damaged = Bool(module, "damaged"), Mark = Int(module, "mark")
            });
        }

        foreach (var value in Array(root, "crew"))
        {
            var crew = Object(value, "crew");
            state.Crew.Add(new CrewState { Id = Text(crew, "id"), Name = Text(crew, "name"), Role = Text(crew, "role"), PostSlot = Int(crew, "postSlot") });
        }
        ReadContracts(root, "offers", state.Offers);
        ReadContracts(root, "jobs", state.Jobs);
        if (root.TryGetValue("travel", out var travelValue) && travelValue != null)
        {
            var travel = Object(travelValue, "travel");
            state.Travel = new TravelState { From = Text(travel, "from"), Destination = Text(travel, "destination"), Total = Int(travel, "total"), Left = Int(travel, "left") };
        }
        foreach (var value in Array(root, "log")) state.Log.Add(value as string ?? "");
        Validate(state);
        return state;
    }

    private static void ReadContracts(Dictionary<string, object?> root, string key, List<ContractState> target)
    {
        foreach (var value in Array(root, key))
        {
            var contract = Object(value, key);
            target.Add(new ContractState
            {
                Id = Int(contract, "id"), Title = Text(contract, "title"), Destination = Text(contract, "destination"),
                Pay = Int(contract, "pay"), Prestige = Int(contract, "prestige")
            });
        }
    }

    private static void AppendModule(StringBuilder json, ModuleState module)
    {
        json.Append('{'); Number(json, "slot", module.Slot).Append(','); String(json, "key", module.Key).Append(',');
        Boolean(json, "powered", module.Powered).Append(','); Boolean(json, "damaged", module.Damaged).Append(','); Number(json, "mark", module.Mark); json.Append('}');
    }
    private static void AppendCrew(StringBuilder json, CrewState crew)
    {
        json.Append('{'); String(json, "id", crew.Id).Append(','); String(json, "name", crew.Name).Append(','); String(json, "role", crew.Role).Append(','); Number(json, "postSlot", crew.PostSlot); json.Append('}');
    }
    private static void AppendContract(StringBuilder json, ContractState contract)
    {
        json.Append('{'); Number(json, "id", contract.Id).Append(','); String(json, "title", contract.Title).Append(','); String(json, "destination", contract.Destination).Append(','); Number(json, "pay", contract.Pay).Append(','); Number(json, "prestige", contract.Prestige); json.Append('}');
    }
    private static void AppendTravel(StringBuilder json, TravelState travel)
    {
        json.Append('{'); String(json, "from", travel.From).Append(','); String(json, "destination", travel.Destination).Append(','); Number(json, "total", travel.Total).Append(','); Number(json, "left", travel.Left); json.Append('}');
    }
    private static void AppendList<T>(StringBuilder json, IReadOnlyList<T> values, Action<StringBuilder, T> append)
    {
        for (var i = 0; i < values.Count; i++) { if (i > 0) json.Append(','); append(json, values[i]); }
    }
    private static StringBuilder String(StringBuilder json, string key, string value) { Quote(json, key); json.Append(':'); return Quote(json, value); }
    private static StringBuilder Number(StringBuilder json, string key, int value) { Quote(json, key); return json.Append(':').Append(value); }
    private static StringBuilder Number(StringBuilder json, string key, float value) { Quote(json, key); return json.Append(':').Append(value.ToString("0.###", CultureInfo.InvariantCulture)); }
    private static StringBuilder Boolean(StringBuilder json, string key, bool value) { Quote(json, key); return json.Append(':').Append(value ? "true" : "false"); }
    private static StringBuilder Quote(StringBuilder json, string value)
    {
        json.Append('"');
        foreach (var character in value)
        {
            switch (character)
            {
                case '"': json.Append("\\\""); break; case '\\': json.Append("\\\\"); break; case '\n': json.Append("\\n"); break;
                case '\r': json.Append("\\r"); break; case '\t': json.Append("\\t"); break;
                default: if (character < 32) json.Append("\\u").Append(((int)character).ToString("x4")); else json.Append(character); break;
            }
        }
        return json.Append('"');
    }

    private static Dictionary<string, object?> Object(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) ? Object(value, key) : throw new InvalidOperationException($"Save JSON is missing object '{key}'.");
    private static Dictionary<string, object?> Object(object? value, string key) => value as Dictionary<string, object?> ?? throw new InvalidOperationException($"Save JSON field '{key}' is not an object.");
    private static List<object?> Array(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) && value is List<object?> list ? list : throw new InvalidOperationException($"Save JSON field '{key}' is not an array.");
    private static string Text(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) && value is string text ? text : throw new InvalidOperationException($"Save JSON field '{key}' is not text.");
    private static int Int(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) && value is double number ? checked((int)number) : throw new InvalidOperationException($"Save JSON field '{key}' is not numeric.");
    private static float Float(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) && value is double number ? (float)number : throw new InvalidOperationException($"Save JSON field '{key}' is not numeric.");
    private static bool Bool(Dictionary<string, object?> root, string key) => root.TryGetValue(key, out var value) && value is bool flag ? flag : throw new InvalidOperationException($"Save JSON field '{key}' is not boolean.");

    private static void Validate(GameState state)
    {
        if (state.Version != GameState.CurrentVersion) throw new InvalidOperationException($"Expected save version {GameState.CurrentVersion}, got {state.Version}.");
        if (state.Ship.BayCount <= 0 || state.Ship.Modules.Count > state.Ship.BayCount) throw new InvalidOperationException("Ship modules must fit within the authored bay count.");
        var slots = state.Ship.Modules.Select(module => module.Slot).ToArray();
        if (slots.Distinct().Count() != slots.Length || slots.Any(slot => slot < 0 || slot >= state.Ship.BayCount))
            throw new InvalidOperationException("Installed module slots must be unique and within the authored hull.");
    }
}
