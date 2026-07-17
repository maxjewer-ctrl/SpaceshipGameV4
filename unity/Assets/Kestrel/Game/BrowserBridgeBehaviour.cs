using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Kestrel.Game;

public sealed class BrowserBridgeBehaviour : MonoBehaviour
{
    public ShipDeckRuntime? Runtime { get; set; }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void KestrelBridgeReady();

    [DllImport("__Internal")]
    private static extern void KestrelBridgeState(string stateJson);

    [DllImport("__Internal")]
    private static extern void KestrelBridgeCapture();
#endif

    private void Start()
    {
        PublishReady();
    }

    public void Command(string json)
    {
        var command = JsonUtility.FromJson<BridgeCommand>(json);
        if (Runtime == null || command == null)
        {
            return;
        }

        switch (command.action)
        {
            case "loadScenario":
                Runtime.BuildScenario(string.IsNullOrWhiteSpace(command.scenario) ? "fresh" : command.scenario, command.seed == 0 ? 8919 : command.seed);
                break;
            case "swapModules":
                Runtime.SwapModules(command.slotA, command.slotB);
                break;
            case "acceptContract":
                Runtime.AcceptContract(command.contractId == 0 ? 1001 : command.contractId);
                break;
            case "depart":
                Runtime.Depart(string.IsNullOrWhiteSpace(command.destination) ? "foundry" : command.destination);
                break;
            case "advanceDay":
                Runtime.AdvanceTravelDay();
                break;
            case "waitDay":
                Runtime.WaitDay();
                break;
            case "runTransferLoop":
                Runtime.RunTransferLoop();
                break;
            case "runLaneEventDemo":
                Runtime.RunLaneEventDemo();
                break;
            case "resolveLaneEvent":
                Runtime.ResolveLaneEvent(command.choice);
                break;
            case "movePlayerToSlot":
                Runtime.MovePlayerToSlot(command.slot);
                break;
            case "movePlayerToCockpit":
                Runtime.MovePlayerToCockpit();
                break;
            case "movePlayerToMidship":
                Runtime.MovePlayerToMidship();
                break;
            case "movePlayerToEngine":
                Runtime.MovePlayerToEngine();
                break;
            case "setCaptainModel":
                Runtime.SetCaptainModel(command.model);
                break;
            case "openCaptainPicker":
                Runtime.OpenCaptainPicker();
                break;
            case "save":
                Runtime.SaveCurrent();
                break;
            case "load":
                Runtime.LoadSaved();
                break;
            case "saveCheckpoint":
                Runtime.SavePlaytestCheckpoint(command.name);
                break;
            case "loadCheckpoint":
                Runtime.LoadPlaytestCheckpoint(command.name);
                break;
            case "deleteCheckpoint":
                Runtime.DeletePlaytestCheckpoint(command.name);
                break;
            case "capture":
                Capture();
                break;
        }
    }

    public void PublishReady()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        KestrelBridgeReady();
#else
        Debug.Log("Kestrel browser bridge ready.");
#endif
        PublishState();
    }

    public void PublishState()
    {
        if (Runtime == null)
        {
            return;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        KestrelBridgeState(Runtime.BridgeStateJson());
#else
        Debug.Log(Runtime.BridgeStateJson());
#endif
    }

    private void Capture()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        KestrelBridgeCapture();
#else
        Debug.Log("Capture requested.");
#endif
    }

    [Serializable]
    private sealed class BridgeCommand
    {
        public string action = "";
        public string scenario = "";
        public int seed;
        public int slot;
        public int slotA;
        public int slotB;
        public int contractId;
        public string destination = "";
        public string model = "";
        public string choice = "";
        public string name = "";
    }
}
