using System;
using UnityEngine;

namespace Kestrel.Game;

public sealed class Interactable : MonoBehaviour
{
    public event Action? OnInteract;

    public string Prompt { get; set; } = "Interact";
    public float Range { get; set; } = 2f;

    private Transform? player;

    private void Update()
    {
        player ??= FindFirstObjectByType<KestrelPlayerController>()?.transform;
        if (player == null)
        {
            return;
        }

        if (Vector3.Distance(player.position, transform.position) <= Range && Input.GetKeyDown(KeyCode.E))
        {
            OnInteract?.Invoke();
        }
    }

    private void OnGUI()
    {
        player ??= FindFirstObjectByType<KestrelPlayerController>()?.transform;
        if (player == null || Camera.main == null)
        {
            return;
        }

        if (Vector3.Distance(player.position, transform.position) > Range)
        {
            return;
        }

        var screen = Camera.main.WorldToScreenPoint(transform.position + Vector3.up * 1.4f);
        if (screen.z < 0f)
        {
            return;
        }

        var rect = new Rect(screen.x - 110f, Screen.height - screen.y - 18f, 220f, 36f);
        GUI.Box(rect, $"E - {Prompt}");
    }
}
