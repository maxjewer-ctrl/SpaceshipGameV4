using UnityEngine;

namespace Kestrel.Game;

public sealed class ModuleBaySocket : MonoBehaviour
{
    public int Slot { get; set; }
    public string ModuleKey { get; set; } = "empty";
    public string ModuleName { get; set; } = "empty";
    public bool Powered { get; set; }

    private void OnDrawGizmos()
    {
        Gizmos.color = Powered ? Color.green : Color.red;
        Gizmos.DrawWireCube(transform.position + Vector3.up * 0.5f, new Vector3(2.4f, 1f, 2.4f));
    }

    private void OnGUI()
    {
        if (Camera.main == null)
        {
            return;
        }

        var screen = Camera.main.WorldToScreenPoint(transform.position + Vector3.up * 1.7f);
        if (screen.z < 0f)
        {
            return;
        }

        var rect = new Rect(screen.x - 80f, Screen.height - screen.y - 14f, 160f, 28f);
        GUI.Label(rect, $"{Slot}: {ModuleName}");
    }
}
