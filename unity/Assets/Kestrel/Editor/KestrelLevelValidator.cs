using System.Collections.Generic;
using System.Linq;
using Kestrel.Game;
using UnityEngine;

namespace Kestrel.Editor;

public sealed class KestrelValidationResult
{
    public List<string> Errors { get; } = new();
    public List<string> Warnings { get; } = new();
}

public static class KestrelLevelValidator
{
    public static KestrelValidationResult ValidateOpenLevel()
    {
        var result = new KestrelValidationResult();
        var sockets = Object.FindObjectsByType<ModuleBaySocket>(FindObjectsSortMode.None);

        if (sockets.Length == 0)
        {
            result.Warnings.Add("No hand-authored ModuleBaySocket objects found. Runtime bootstrap will create the current prototype deck.");
            return result;
        }

        var duplicates = sockets.GroupBy(socket => socket.Slot).Where(group => group.Count() > 1).Select(group => group.Key).ToArray();
        if (duplicates.Length > 0)
        {
            result.Errors.Add($"Duplicate module socket slots: {string.Join(", ", duplicates)}");
        }

        var ordered = sockets.Select(socket => socket.Slot).OrderBy(slot => slot).ToArray();
        var expected = Enumerable.Range(0, ordered.Length).ToArray();
        if (!ordered.SequenceEqual(expected))
        {
            result.Errors.Add($"Module socket slots must be contiguous from 0. Found: {string.Join(", ", ordered)}");
        }

        return result;
    }
}
