using Kestrel.Sim;
using UnityEngine;

namespace Kestrel.Game;

[DefaultExecutionOrder(100)]
public sealed class CaptainPickerUI : MonoBehaviour
{
    private static readonly Option[] Options =
    {
        new(CaptainAppearance.Explorer, "EXPLORER", "Human man · steady command presence"),
        new(CaptainAppearance.FemaleExplorer, "TRAILBLAZER", "Human woman · frontier flight suit"),
        new(CaptainAppearance.AlienExplorer, "OUTRIDER", "Amphibian spacer · frog kin-line")
    };

    private ShipDeckRuntime? runtime;
    private bool initialized;
    private bool isOpen;
    private string modelAtOpen = CaptainAppearance.Explorer;
    private GUIStyle? titleStyle;
    private GUIStyle? subtitleStyle;
    private GUIStyle? optionStyle;
    private GUIStyle? selectedStyle;
    private GUIStyle? hintStyle;

    public bool IsOpen => isOpen;

    public void Initialize(ShipDeckRuntime deckRuntime)
    {
        runtime = deckRuntime;
        if (initialized)
        {
            if (isOpen) runtime.BeginCaptainPreview();
            return;
        }

        initialized = true;
        Open();
    }

    public void Open()
    {
        if (runtime == null || isOpen) return;
        modelAtOpen = runtime.CaptainModelId;
        isOpen = true;
        runtime.BeginCaptainPreview();
    }

    public void Close(bool saveSelection = true)
    {
        if (runtime == null || !isOpen) return;
        if (!saveSelection) runtime.SetCaptainModel(modelAtOpen);
        isOpen = false;
        runtime.EndCaptainPreview();
        if (saveSelection) runtime.SaveCurrent();
    }

    private void Update()
    {
        if (runtime == null) return;
        if (!isOpen)
        {
            if (Input.GetKeyDown(KeyCode.C)) Open();
            return;
        }

        if (Input.GetKeyDown(KeyCode.Alpha1)) Select(0);
        if (Input.GetKeyDown(KeyCode.Alpha2)) Select(1);
        if (Input.GetKeyDown(KeyCode.Alpha3)) Select(2);
        if (Input.GetKeyDown(KeyCode.LeftArrow)) Select(PreviousIndex());
        if (Input.GetKeyDown(KeyCode.RightArrow)) Select(NextIndex());
        if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)) Close();
        if (Input.GetKeyDown(KeyCode.Escape)) Close(false);
    }

    private void OnGUI()
    {
        if (runtime == null) return;
        EnsureStyles();
        GUI.depth = -100;

        if (!isOpen)
        {
            var label = $"Captain · {SelectedOption().Title}   [C] Change";
            if (GUI.Button(new Rect(18f, Screen.height - 48f, 270f, 30f), label)) Open();
            return;
        }

        var previousColor = GUI.color;
        GUI.color = new Color(0.015f, 0.025f, 0.04f, 0.58f);
        GUI.DrawTexture(new Rect(0f, 0f, Screen.width, Screen.height), Texture2D.whiteTexture);
        GUI.color = previousColor;

        var width = Mathf.Min(880f, Screen.width - 48f);
        var panel = new Rect((Screen.width - width) * 0.5f, 28f, width, Screen.height - 56f);
        GUI.Box(panel, GUIContent.none);
        GUILayout.BeginArea(new Rect(panel.x + 28f, panel.y + 22f, panel.width - 56f, panel.height - 44f));
        GUILayout.Label("CHOOSE YOUR CAPTAIN", titleStyle);
        GUILayout.Label("The model in the ship is the live Unity prefab. Your choice is stored in the version-16 save.", subtitleStyle);
        GUILayout.Space(Mathf.Max(180f, panel.height * 0.45f));

        GUILayout.BeginHorizontal();
        for (var index = 0; index < Options.Length; index++)
        {
            var option = Options[index];
            var selected = runtime.CaptainModelId == option.Id;
            var oldBackground = GUI.backgroundColor;
            if (selected) GUI.backgroundColor = new Color(0.95f, 0.62f, 0.22f);
            if (GUILayout.Button($"{index + 1}  {option.Title}\n{option.Description}", selected ? selectedStyle : optionStyle, GUILayout.Height(76f)))
            {
                Select(index);
            }
            GUI.backgroundColor = oldBackground;
            if (index < Options.Length - 1) GUILayout.Space(10f);
        }
        GUILayout.EndHorizontal();

        GUILayout.Space(18f);
        GUILayout.Label("← → or 1–3 to preview · Enter to confirm · Esc to keep playing without saving", hintStyle);
        GUILayout.FlexibleSpace();
        var oldConfirmColor = GUI.backgroundColor;
        GUI.backgroundColor = new Color(0.2f, 0.72f, 0.78f);
        if (GUILayout.Button($"CONFIRM {SelectedOption().Title}", optionStyle, GUILayout.Height(48f))) Close();
        GUI.backgroundColor = oldConfirmColor;
        GUILayout.EndArea();
    }

    private void Select(int index)
    {
        if (runtime == null || index < 0 || index >= Options.Length) return;
        runtime.SetCaptainModel(Options[index].Id);
    }

    private int CurrentIndex()
    {
        if (runtime == null) return 0;
        for (var index = 0; index < Options.Length; index++)
        {
            if (Options[index].Id == runtime.CaptainModelId) return index;
        }
        return 0;
    }

    private int PreviousIndex() => (CurrentIndex() + Options.Length - 1) % Options.Length;
    private int NextIndex() => (CurrentIndex() + 1) % Options.Length;
    private Option SelectedOption() => Options[CurrentIndex()];

    private void EnsureStyles()
    {
        if (titleStyle != null) return;
        titleStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 24,
            fontStyle = FontStyle.Bold,
            normal = { textColor = new Color(0.72f, 0.95f, 1f) }
        };
        subtitleStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 12,
            wordWrap = true,
            normal = { textColor = new Color(0.65f, 0.72f, 0.78f) }
        };
        optionStyle = new GUIStyle(GUI.skin.button)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 12,
            fontStyle = FontStyle.Bold,
            wordWrap = true
        };
        selectedStyle = new GUIStyle(optionStyle)
        {
            normal = { textColor = Color.white },
            hover = { textColor = Color.white },
            active = { textColor = Color.white }
        };
        hintStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 11,
            normal = { textColor = new Color(0.72f, 0.74f, 0.78f) }
        };
    }

    private sealed class Option
    {
        public Option(string id, string title, string description)
        {
            Id = id;
            Title = title;
            Description = description;
        }

        public string Id { get; }
        public string Title { get; }
        public string Description { get; }
    }
}
