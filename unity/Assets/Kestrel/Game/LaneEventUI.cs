using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

[DefaultExecutionOrder(110)]
public sealed class LaneEventUI : MonoBehaviour
{
    private ShipDeckRuntime? runtime;
    private bool isOpen;
    private GUIStyle? titleStyle;
    private GUIStyle? bodyStyle;
    private GUIStyle? resourceStyle;
    private GUIStyle? hintStyle;
    private GUIStyle? buttonStyle;

    public bool IsOpen => isOpen;

    public void Initialize(ShipDeckRuntime deckRuntime)
    {
        runtime = deckRuntime;
        if (runtime.State.LaneEvent != null) OpenIfPending();
        else if (isOpen) ClosePresentation();
    }

    public void OpenIfPending()
    {
        if (runtime?.State.LaneEvent?.Key != LaneEvents.TinkerTrader || isOpen) return;
        isOpen = true;
        runtime.BeginLaneEventPresentation();
    }

    public void CloseIfResolved()
    {
        if (runtime?.State.LaneEvent == null && isOpen) ClosePresentation();
    }

    private void Update()
    {
        if (!isOpen || runtime == null) return;
        if (Input.GetKeyDown(KeyCode.Alpha1) || Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
            Resolve(LaneEvents.BuyFood);
        if (Input.GetKeyDown(KeyCode.Alpha2) || Input.GetKeyDown(KeyCode.Escape))
            Resolve(LaneEvents.Dismiss);
    }

    private void OnGUI()
    {
        if (!isOpen || runtime?.State.LaneEvent?.Key != LaneEvents.TinkerTrader) return;
        EnsureStyles();
        GUI.depth = -120;

        var oldColor = GUI.color;
        GUI.color = new Color(0.005f, 0.012f, 0.02f, 0.72f);
        GUI.DrawTexture(new Rect(0f, 0f, Screen.width, Screen.height), Texture2D.whiteTexture);
        GUI.color = oldColor;

        var width = Mathf.Min(720f, Screen.width - 44f);
        var height = Mathf.Min(400f, Screen.height - 56f);
        var panel = new Rect((Screen.width - width) * 0.5f, (Screen.height - height) * 0.5f, width, height);
        GUI.Box(panel, GUIContent.none);
        GUILayout.BeginArea(new Rect(panel.x + 30f, panel.y + 24f, panel.width - 60f, panel.height - 48f));
        GUILayout.Label("INCOMING HAIL - TINKER BARGE \"BARGAIN\"", titleStyle);
        GUILayout.Space(14f);
        GUILayout.Label("A patchwork trader matches your burn, grinning through static: \"Fuel, food, fair-ish prices! Also buying goods at a premium - I know a guy.\"", bodyStyle);
        GUILayout.Space(20f);
        GUILayout.Box($"SHIP STORES   {runtime.State.Credits}cr   /   Food {runtime.State.Food}", resourceStyle, GUILayout.Height(34f));
        GUILayout.FlexibleSpace();

        var oldBackground = GUI.backgroundColor;
        GUI.backgroundColor = runtime.State.Credits >= 30
            ? new Color(0.18f, 0.68f, 0.72f)
            : new Color(0.42f, 0.28f, 0.24f);
        if (GUILayout.Button("1  BUY 10 FOOD  -  30cr", buttonStyle, GUILayout.Height(54f))) Resolve(LaneEvents.BuyFood);
        GUI.backgroundColor = new Color(0.24f, 0.28f, 0.34f);
        if (GUILayout.Button("2  WAVE THE TINKER OFF", buttonStyle, GUILayout.Height(46f))) Resolve(LaneEvents.Dismiss);
        GUI.backgroundColor = oldBackground;
        GUILayout.Space(6f);
        GUILayout.Label("1 / Enter to buy - 2 / Esc to decline", hintStyle);
        GUILayout.EndArea();
    }

    private void Resolve(string choice)
    {
        if (runtime == null || !runtime.ResolveLaneEvent(choice)) return;
        if (isOpen) ClosePresentation();
    }

    private void ClosePresentation()
    {
        isOpen = false;
        runtime?.EndLaneEventPresentation();
    }

    private void EnsureStyles()
    {
        if (titleStyle != null) return;
        titleStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 20,
            fontStyle = FontStyle.Bold,
            normal = { textColor = new Color(0.62f, 0.95f, 1f) }
        };
        bodyStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.UpperCenter,
            fontSize = 14,
            wordWrap = true,
            normal = { textColor = new Color(0.82f, 0.86f, 0.9f) }
        };
        resourceStyle = new GUIStyle(GUI.skin.box)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 12,
            fontStyle = FontStyle.Bold,
            normal = { textColor = new Color(0.72f, 0.88f, 0.92f) }
        };
        hintStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 11,
            normal = { textColor = new Color(0.68f, 0.76f, 0.82f) }
        };
        buttonStyle = new GUIStyle(GUI.skin.button)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 13,
            fontStyle = FontStyle.Bold
        };
    }
}
