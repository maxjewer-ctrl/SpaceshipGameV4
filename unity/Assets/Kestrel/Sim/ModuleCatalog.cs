using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Kestrel.Sim;

public sealed class ModuleCatalog
{
    private readonly Dictionary<string, ModuleDefinition> definitions;

    public ModuleCatalog(IEnumerable<ModuleDefinition> modules)
    {
        definitions = new Dictionary<string, ModuleDefinition>(StringComparer.Ordinal);
        foreach (var module in modules)
        {
            definitions[module.Key] = module;
        }
    }

    public IReadOnlyDictionary<string, ModuleDefinition> Definitions => definitions;

    public ModuleDefinition? Find(string key)
    {
        definitions.TryGetValue(key, out var value);
        return value;
    }

    public static ModuleCatalog Empty { get; } = new(Array.Empty<ModuleDefinition>());

    public static ModuleCatalog ParseModulesJson(string json)
    {
        var modules = new List<ModuleDefinition>();
        foreach (Match match in Regex.Matches(json, "\"(?<key>[^\"]+)\"\\s*:\\s*\\{(?<body>[^}]*)\\}"))
        {
            var body = match.Groups["body"].Value;
            modules.Add(new ModuleDefinition
            {
                Key = match.Groups["key"].Value,
                Name = StringField(body, "n"),
                Description = StringField(body, "d"),
                Icon = StringField(body, "icon"),
                Price = IntField(body, "price"),
                PowerDraw = IntField(body, "pw"),
                Core = BoolField(body, "core")
            });
        }

        return new ModuleCatalog(modules);
    }

    private static string StringField(string body, string key)
    {
        var match = Regex.Match(body, $"\"{key}\"\\s*:\\s*\"(?<value>(?:\\\\\"|[^\"])*)\"");
        return match.Success ? match.Groups["value"].Value.Replace("\\\"", "\"") : "";
    }

    private static int IntField(string body, string key)
    {
        var match = Regex.Match(body, $"\"{key}\"\\s*:\\s*(?<value>-?\\d+)");
        return match.Success ? int.Parse(match.Groups["value"].Value) : 0;
    }

    private static bool BoolField(string body, string key)
    {
        var match = Regex.Match(body, $"\"{key}\"\\s*:\\s*(?<value>true|false)");
        return match.Success && match.Groups["value"].Value == "true";
    }
}
