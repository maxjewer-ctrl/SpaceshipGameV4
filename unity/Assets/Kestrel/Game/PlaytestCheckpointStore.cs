using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Kestrel.Game;

public static class PlaytestCheckpointStore
{
    private const string IndexKey = "kestrelrun:unity:checkpoint:index";
    private const string CheckpointPrefix = "kestrelrun:unity:checkpoint:";

    public static IReadOnlyList<string> Names()
    {
        var index = KestrelSaveStore.Load(IndexKey);
        if (string.IsNullOrWhiteSpace(index)) return Array.Empty<string>();
        return index.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(NormalizeName)
            .Where(name => name.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();
    }

    public static string Save(string name, string saveJson)
    {
        var normalized = RequireName(name);
        KestrelSaveStore.Save(Key(normalized), saveJson);
        var names = Names().Append(normalized)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(candidate => candidate, StringComparer.Ordinal);
        KestrelSaveStore.Save(IndexKey, string.Join("\n", names));
        return normalized;
    }

    public static string Load(string name)
    {
        var normalized = NormalizeName(name);
        return normalized.Length == 0 ? "" : KestrelSaveStore.Load(Key(normalized));
    }

    public static bool Delete(string name)
    {
        var normalized = NormalizeName(name);
        if (normalized.Length == 0 || !Names().Contains(normalized, StringComparer.Ordinal)) return false;
        KestrelSaveStore.Delete(Key(normalized));
        var remaining = Names().Where(candidate => candidate != normalized);
        KestrelSaveStore.Save(IndexKey, string.Join("\n", remaining));
        return true;
    }

    public static string NormalizeName(string? name)
    {
        var source = (name ?? "").Trim().ToLowerInvariant();
        var normalized = new StringBuilder(Math.Min(source.Length, 40));
        var pendingSeparator = false;
        foreach (var character in source)
        {
            if (char.IsLetterOrDigit(character))
            {
                if (pendingSeparator && normalized.Length > 0) normalized.Append('-');
                normalized.Append(character);
                pendingSeparator = false;
            }
            else if (character is '-' or '_' || char.IsWhiteSpace(character))
            {
                pendingSeparator = normalized.Length > 0;
            }

            if (normalized.Length >= 40) break;
        }

        return normalized.ToString().TrimEnd('-');
    }

    private static string RequireName(string name)
    {
        var normalized = NormalizeName(name);
        if (normalized.Length == 0) throw new ArgumentException("Checkpoint name must contain letters or numbers.", nameof(name));
        return normalized;
    }

    private static string Key(string normalizedName) => CheckpointPrefix + normalizedName;
}
