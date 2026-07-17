using UnityEngine;

namespace Kestrel.Game
{
public sealed class ShipBayRoom : MonoBehaviour
{
    [SerializeField] private ModuleBaySocket? socket;
    [SerializeField] private Collider? floorCollider;

    public ModuleBaySocket? Socket => socket;
    public Collider? FloorCollider => floorCollider;

    public void Configure(ModuleBaySocket roomSocket, Collider roomFloor)
    {
        socket = roomSocket;
        floorCollider = roomFloor;
    }
}
}
