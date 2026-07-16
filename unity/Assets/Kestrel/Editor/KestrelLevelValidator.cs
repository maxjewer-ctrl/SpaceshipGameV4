using System.Collections.Generic;
using System.Linq;
using Kestrel.Game;
using UnityEditor;
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
        var layout = Object.FindFirstObjectByType<ShipDeckLayout>();
        if (layout != null) return ValidateLayout(layout.gameObject);
        return ValidatePrefabAtPath(KestrelShipPrefabBuilder.SixBayPrefabPath);
    }

    public static KestrelValidationResult ValidatePrefabAtPath(string path)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (prefab == null)
        {
            var missing = new KestrelValidationResult();
            missing.Errors.Add($"Missing authored ship prefab: {path}");
            return missing;
        }
        return ValidateLayout(prefab);
    }

    public static KestrelValidationResult ValidateLayout(GameObject root)
    {
        var result = new KestrelValidationResult();
        var layout = root.GetComponent<ShipDeckLayout>();
        if (layout == null)
        {
            result.Errors.Add("Authored ship prefab is missing ShipDeckLayout.");
            return result;
        }

        if (layout.CaptainConsoleAnchor == null) result.Errors.Add("Ship deck is missing its captain-console interaction anchor.");
        if (layout.BayCount <= 0) result.Errors.Add("Ship deck bay count must be positive.");

        var sockets = root.GetComponentsInChildren<ModuleBaySocket>(true);
        if (sockets.Length != layout.BayCount)
        {
            result.Errors.Add($"Expected {layout.BayCount} module sockets, found {sockets.Length}.");
        }

        var duplicates = sockets.GroupBy(socket => socket.Slot).Where(group => group.Count() > 1).Select(group => group.Key).ToArray();
        if (duplicates.Length > 0) result.Errors.Add($"Duplicate module socket slots: {string.Join(", ", duplicates)}");
        var ordered = sockets.Select(socket => socket.Slot).OrderBy(slot => slot).ToArray();
        var expected = Enumerable.Range(0, sockets.Length).ToArray();
        if (!ordered.SequenceEqual(expected)) result.Errors.Add($"Module socket slots must be contiguous from 0. Found: {string.Join(", ", ordered)}");

        foreach (var socket in sockets)
        {
            if (!Finite(socket.transform.position)) result.Errors.Add($"Module socket {socket.Slot} has a non-finite transform.");
            if (socket.InteractionAnchor == null) result.Errors.Add($"Module socket {socket.Slot} is missing an interaction anchor.");
            if (socket.RoomCollider == null) result.Errors.Add($"Module socket {socket.Slot} is missing its room collider.");
            else if (!socket.RoomCollider.enabled) result.Errors.Add($"Module socket {socket.Slot} has a disabled room collider.");
        }

        var rooms = root.GetComponentsInChildren<ShipBayRoom>(true);
        if (rooms.Length != layout.BayCount) result.Errors.Add($"Expected {layout.BayCount} authored ShipBayRoom components, found {rooms.Length}.");
        foreach (var room in rooms)
        {
            if (room.Socket == null) result.Errors.Add($"{room.name} is missing its ModuleBaySocket reference.");
            if (room.FloorCollider == null) result.Errors.Add($"{room.name} is missing its floor collider reference.");
        }

        if (root.GetComponentsInChildren<Collider>(true).Length < layout.BayCount)
        {
            result.Errors.Add("Authored ship deck does not contain enough colliders for its rooms.");
        }
        return result;
    }

    private static bool Finite(Vector3 value) =>
        !float.IsNaN(value.x) && !float.IsInfinity(value.x) &&
        !float.IsNaN(value.y) && !float.IsInfinity(value.y) &&
        !float.IsNaN(value.z) && !float.IsInfinity(value.z);
}
