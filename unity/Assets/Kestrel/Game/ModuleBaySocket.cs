using UnityEngine;

namespace Kestrel.Game
{
public sealed class ModuleBaySocket : MonoBehaviour
{
    [SerializeField] private int slot;
    [SerializeField] private Transform? interactionAnchor;
    [SerializeField] private Collider? roomCollider;

    public int Slot { get => slot; set => slot = value; }
    public Transform? InteractionAnchor => interactionAnchor;
    public Collider? RoomCollider => roomCollider;
    public string ModuleKey { get; set; } = "empty";
    public string ModuleName { get; set; } = "empty";
    public bool Powered { get; set; }

    public void Configure(int stableSlot, Transform anchor, Collider collider)
    {
        slot = stableSlot;
        interactionAnchor = anchor;
        roomCollider = collider;
    }

    private void OnDrawGizmos()
    {
        Gizmos.color = Powered ? Color.green : Color.red;
        Gizmos.DrawWireCube(transform.position + Vector3.up * 0.5f, new Vector3(2.4f, 1f, 2.4f));
    }

    private void OnGUI()
    {
        var camera = Camera.main;
        var player = FindFirstObjectByType<KestrelPlayerController>();
        if (camera == null || player == null || Vector3.Distance(player.transform.position, transform.position) > 4.8f)
        {
            return;
        }

        var screen = camera.WorldToScreenPoint(transform.position + Vector3.up * 1.7f);
        if (screen.z < 0f) return;
        var rect = new Rect(screen.x - 80f, Screen.height - screen.y - 14f, 160f, 28f);
        GUI.Label(rect, $"{Slot}: {ModuleName}");
    }
}
}
