using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace Kestrel.Sim;

public static class SaveCodec
{
    public static string Serialize(GameState state)
    {
        if (state.Version != GameState.CurrentVersion)
        {
            throw new InvalidOperationException($"Expected save version {GameState.CurrentVersion}, got {state.Version}.");
        }

        var json = new StringBuilder();
        json.Append('{');
        json.Append("\"version\":").Append(state.Version).Append(',');
        json.Append("\"seed\":").Append(state.Seed).Append(',');
        json.Append("\"scenario\":\"").Append(Escape(state.Scenario)).Append("\",");
        json.Append("\"ship\":{");
        json.Append("\"hull\":\"").Append(Escape(state.Ship.Hull)).Append("\",");
        json.Append("\"bayCount\":").Append(state.Ship.BayCount).Append(',');
        json.Append("\"modules\":[");
        for (var i = 0; i < state.Ship.Modules.Count; i++)
        {
            if (i > 0)
            {
                json.Append(',');
            }

            var module = state.Ship.Modules[i];
            json.Append('{');
            json.Append("\"slot\":").Append(module.Slot).Append(',');
            json.Append("\"key\":\"").Append(Escape(module.Key)).Append("\",");
            json.Append("\"powered\":").Append(module.Powered ? "true" : "false");
            json.Append('}');
        }

        json.Append("]},");
        json.Append("\"crew\":[");
        for (var i = 0; i < state.Crew.Count; i++)
        {
            if (i > 0)
            {
                json.Append(',');
            }

            var crew = state.Crew[i];
            json.Append('{');
            json.Append("\"id\":\"").Append(Escape(crew.Id)).Append("\",");
            json.Append("\"name\":\"").Append(Escape(crew.Name)).Append("\",");
            json.Append("\"role\":\"").Append(Escape(crew.Role)).Append("\",");
            json.Append("\"postSlot\":").Append(crew.PostSlot);
            json.Append('}');
        }

        json.Append("]}");
        return json.ToString();
    }

    public static GameState Deserialize(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidOperationException("Save JSON did not contain a game state.");
        }

        var state = new GameState
        {
            Version = IntValue(json, "version"),
            Seed = IntValue(json, "seed"),
            Scenario = StringValue(json, "scenario"),
            Ship = new ShipState
            {
                Hull = StringValue(json, "hull"),
                BayCount = IntValue(json, "bayCount"),
                Modules = ParseModules(json)
            },
            Crew = ParseCrew(json)
        };

        if (state.Version > GameState.CurrentVersion)
        {
            throw new InvalidOperationException($"Save version {state.Version} is newer than this build supports.");
        }

        state.Version = GameState.CurrentVersion;
        return state;
    }

    private static List<ModuleState> ParseModules(string json)
    {
        var modules = new List<ModuleState>();
        foreach (Match match in Regex.Matches(json, "\\{\"slot\":(?<slot>-?\\d+),\"key\":\"(?<key>[^\"]*)\",\"powered\":(?<powered>true|false)\\}"))
        {
            modules.Add(new ModuleState
            {
                Slot = int.Parse(match.Groups["slot"].Value),
                Key = Unescape(match.Groups["key"].Value),
                Powered = match.Groups["powered"].Value == "true"
            });
        }

        return modules;
    }

    private static List<CrewState> ParseCrew(string json)
    {
        var crew = new List<CrewState>();
        foreach (Match match in Regex.Matches(json, "\\{\"id\":\"(?<id>[^\"]*)\",\"name\":\"(?<name>[^\"]*)\",\"role\":\"(?<role>[^\"]*)\",\"postSlot\":(?<postSlot>-?\\d+)\\}"))
        {
            crew.Add(new CrewState
            {
                Id = Unescape(match.Groups["id"].Value),
                Name = Unescape(match.Groups["name"].Value),
                Role = Unescape(match.Groups["role"].Value),
                PostSlot = int.Parse(match.Groups["postSlot"].Value)
            });
        }

        return crew;
    }

    private static int IntValue(string json, string key)
    {
        var match = Regex.Match(json, $"\"{key}\":(?<value>-?\\d+)");
        if (!match.Success)
        {
            throw new InvalidOperationException($"Save JSON is missing numeric field '{key}'.");
        }

        return int.Parse(match.Groups["value"].Value);
    }

    private static string StringValue(string json, string key)
    {
        var match = Regex.Match(json, $"\"{key}\":\"(?<value>[^\"]*)\"");
        if (!match.Success)
        {
            throw new InvalidOperationException($"Save JSON is missing string field '{key}'.");
        }

        return Unescape(match.Groups["value"].Value);
    }

    private static string Escape(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private static string Unescape(string value)
    {
        return value.Replace("\\\"", "\"").Replace("\\\\", "\\");
    }
}
