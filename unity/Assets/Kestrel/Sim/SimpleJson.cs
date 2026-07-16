using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Kestrel.Sim;

internal static class SimpleJson
{
    public static Dictionary<string, object?> ParseObject(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) throw new InvalidOperationException("Save JSON was empty.");
        var parser = new Parser(json);
        var value = parser.ParseValue();
        parser.Finish();
        return value as Dictionary<string, object?> ?? throw new InvalidOperationException("Save JSON root must be an object.");
    }

    private sealed class Parser
    {
        private readonly string source;
        private int index;
        public Parser(string source) => this.source = source;

        public object? ParseValue()
        {
            Space();
            if (index >= source.Length) throw Error("Unexpected end of JSON.");
            return source[index] switch
            {
                '{' => ParseObject(), '[' => ParseArray(), '"' => ParseString(), 't' => Literal("true", true),
                'f' => Literal("false", false), 'n' => Literal("null", null), _ => ParseNumber()
            };
        }

        public void Finish() { Space(); if (index != source.Length) throw Error("Unexpected trailing JSON."); }

        private Dictionary<string, object?> ParseObject()
        {
            Expect('{'); var result = new Dictionary<string, object?>(); Space();
            if (Take('}')) return result;
            while (true)
            {
                Space(); var key = ParseString(); Space(); Expect(':'); result[key] = ParseValue(); Space();
                if (Take('}')) return result; Expect(',');
            }
        }

        private List<object?> ParseArray()
        {
            Expect('['); var result = new List<object?>(); Space();
            if (Take(']')) return result;
            while (true) { result.Add(ParseValue()); Space(); if (Take(']')) return result; Expect(','); }
        }

        private string ParseString()
        {
            Expect('"'); var value = new StringBuilder();
            while (index < source.Length)
            {
                var character = source[index++];
                if (character == '"') return value.ToString();
                if (character != '\\') { value.Append(character); continue; }
                if (index >= source.Length) throw Error("Unterminated escape.");
                var escaped = source[index++];
                switch (escaped)
                {
                    case '"': value.Append('"'); break; case '\\': value.Append('\\'); break; case '/': value.Append('/'); break;
                    case 'b': value.Append('\b'); break; case 'f': value.Append('\f'); break; case 'n': value.Append('\n'); break;
                    case 'r': value.Append('\r'); break; case 't': value.Append('\t'); break;
                    case 'u':
                        if (index + 4 > source.Length) throw Error("Incomplete unicode escape.");
                        value.Append((char)int.Parse(source.Substring(index, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture)); index += 4; break;
                    default: throw Error($"Unsupported escape '{escaped}'.");
                }
            }
            throw Error("Unterminated string.");
        }

        private double ParseNumber()
        {
            var start = index;
            if (Take('-')) { }
            while (index < source.Length && char.IsDigit(source[index])) index++;
            if (Take('.')) while (index < source.Length && char.IsDigit(source[index])) index++;
            if (index < source.Length && (source[index] == 'e' || source[index] == 'E'))
            {
                index++; if (index < source.Length && (source[index] == '+' || source[index] == '-')) index++;
                while (index < source.Length && char.IsDigit(source[index])) index++;
            }
            if (!double.TryParse(source.Substring(start, index - start), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)) throw Error("Invalid number.");
            return value;
        }

        private object? Literal(string token, object? value)
        {
            if (index + token.Length > source.Length || source.Substring(index, token.Length) != token) throw Error($"Expected '{token}'.");
            index += token.Length; return value;
        }
        private void Space() { while (index < source.Length && char.IsWhiteSpace(source[index])) index++; }
        private bool Take(char expected) { if (index < source.Length && source[index] == expected) { index++; return true; } return false; }
        private void Expect(char expected) { if (!Take(expected)) throw Error($"Expected '{expected}'."); }
        private InvalidOperationException Error(string message) => new($"{message} Offset {index}.");
    }
}
