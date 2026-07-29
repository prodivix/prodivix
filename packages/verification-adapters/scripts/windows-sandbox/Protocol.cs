using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Prodivix.StaticSandbox;

internal sealed record LaunchRequest
{
    public required string Format { get; init; }
    public required string ProfileName { get; init; }
    public required string Root { get; init; }
    public required string Application { get; init; }
    public required string[] Arguments { get; init; }
    public required Dictionary<string, string> Environment { get; init; }
    public required string[] ResultPaths { get; init; }
    public required int TimeoutMilliseconds { get; init; }
    public required int MaximumOutputBytes { get; init; }
}

internal sealed record OutputReceipt(
    string Text,
    string Digest,
    long ByteLength,
    bool Truncated);

internal sealed record AppContainerReceipt(
    string ProfileName,
    string ProfileSid,
    bool TokenIsAppContainer,
    bool TokenSidMatched,
    int TokenCapabilityCount,
    string[] Capabilities,
    bool ProfileStorageBound);

internal sealed record JobReceipt(
    bool KillOnClose,
    int ActiveProcessLimit,
    uint TotalProcesses,
    uint ActiveProcesses,
    uint TerminatedProcesses,
    bool ProcessTreeClean);

internal sealed record ProcessReceipt(
    string Application,
    string[] Arguments,
    string WorkingDirectory,
    string EnvironmentDigest,
    int ExitCode,
    string? Signal,
    bool TimedOut,
    OutputReceipt Stdout,
    OutputReceipt Stderr);

internal sealed record LaunchResult(
    string Format,
    string RequestDigest,
    string Provider,
    AppContainerReceipt AppContainer,
    JobReceipt Job,
    ProcessReceipt Process);

internal static partial class Protocol
{
    internal const string RequestFormat =
        "prodivix.windows-appcontainer-launch-request.v1";
    internal const string ResultFormat =
        "prodivix.windows-appcontainer-launch-result.v1";

    private const int MaximumRequestBytes = 1024 * 1024;
    private static readonly string[] RequiredEnvironmentNames =
    [
        "APPDATA",
        "CI",
        "HOME",
        "LOCALAPPDATA",
        "NPM_CONFIG_FETCH_RETRIES",
        "NPM_CONFIG_NODE_LINKER",
        "NPM_CONFIG_OFFLINE",
        "NPM_CONFIG_PACKAGE_IMPORT_METHOD",
        "NPM_CONFIG_REGISTRY",
        "NPM_CONFIG_TRUST_LOCKFILE",
        "NPM_CONFIG_WORKSPACE_DIR",
        "SystemRoot",
        "TEMP",
        "TMP",
        "USERPROFILE",
    ];
    private static readonly string[] RootBoundEnvironmentNames =
    [
        "APPDATA",
        "HOME",
        "LOCALAPPDATA",
        "NPM_CONFIG_WORKSPACE_DIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
    ];
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
        WriteIndented = false,
    };

    [GeneratedRegex(@"^Prodivix\.Static\.[A-Za-z0-9._-]{1,47}$",
        RegexOptions.CultureInvariant)]
    private static partial Regex ProfileNamePattern();

    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_()]*$",
        RegexOptions.CultureInvariant)]
    private static partial Regex EnvironmentNamePattern();

    internal static (LaunchRequest Request, string RequestDigest) ReadRequest(
        string[] arguments)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "The AppContainer launcher is available only on Windows.");
        }
        if (arguments.Length != 1)
        {
            throw new ArgumentException(
                "The AppContainer launcher requires one request path.");
        }
        var requestPath = Path.GetFullPath(arguments[0]);
        var bytes = File.ReadAllBytes(requestPath);
        if (bytes.Length is 0 or > MaximumRequestBytes)
        {
            throw new InvalidDataException(
                "The AppContainer request exceeds its byte budget.");
        }
        RejectDuplicateProperties(bytes);
        var request = JsonSerializer.Deserialize<LaunchRequest>(
            bytes,
            JsonOptions) ?? throw new InvalidDataException(
                "The AppContainer request is empty.");
        return (Validate(request), Sha256(bytes));
    }

    internal static string Serialize<T>(T value) =>
        JsonSerializer.Serialize(value, JsonOptions);

    internal static string Sha256(ReadOnlySpan<byte> bytes) =>
        $"sha256-{Convert.ToHexStringLower(SHA256.HashData(bytes))}";

    internal static string EnvironmentDigest(
        IReadOnlyDictionary<string, string> environment)
    {
        var entries = environment
            .OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.Key, StringComparer.Ordinal)
            .Select(entry => new KeyValuePair<string, string>(
                entry.Key,
                entry.Value))
            .ToArray();
        return Sha256(JsonSerializer.SerializeToUtf8Bytes(
            entries,
            JsonOptions));
    }

    internal static bool IsInsideRoot(string root, string candidate)
    {
        var normalizedRoot = Path.TrimEndingDirectorySeparator(
            Path.GetFullPath(root));
        var normalizedCandidate = Path.GetFullPath(candidate);
        return normalizedCandidate.Equals(
                normalizedRoot,
                StringComparison.OrdinalIgnoreCase) ||
            normalizedCandidate.StartsWith(
                $"{normalizedRoot}{Path.DirectorySeparatorChar}",
                StringComparison.OrdinalIgnoreCase);
    }

    private static LaunchRequest Validate(LaunchRequest request)
    {
        if (request.Format != RequestFormat)
        {
            throw new InvalidDataException(
                "The AppContainer request format is unsupported.");
        }
        if (!ProfileNamePattern().IsMatch(request.ProfileName) ||
            request.ProfileName.Length > 64)
        {
            throw new InvalidDataException(
                "The AppContainer profile name is invalid.");
        }
        var root = Path.TrimEndingDirectorySeparator(
            Path.GetFullPath(request.Root));
        var application = Path.GetFullPath(request.Application);
        if (!Directory.Exists(root) ||
            !File.Exists(application) ||
            !IsInsideRoot(root, application) ||
            !application.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                "The AppContainer application must be an executable inside its root.");
        }
        if (request.Arguments.Length > 256 ||
            request.Arguments.Any(argument =>
                argument.Length is 0 or > 16_384 ||
                argument.Any(character =>
                    character is '\0' or '\r' or '\n')))
        {
            throw new InvalidDataException(
                "The AppContainer arguments are invalid.");
        }
        if (request.Environment.Count != RequiredEnvironmentNames.Length ||
            request.Environment.Any(entry =>
                !EnvironmentNamePattern().IsMatch(entry.Key) ||
                !RequiredEnvironmentNames.Contains(
                    entry.Key,
                    StringComparer.Ordinal) ||
                entry.Value.Length > 32_767 ||
                entry.Value.Contains('\0')))
        {
            throw new InvalidDataException(
                "The AppContainer environment is invalid.");
        }
        if (request.ResultPaths.Length > 16 ||
            request.ResultPaths.Any(path =>
                path.Length is 0 or > 4_096 ||
                path.Contains('\\') ||
                path.StartsWith('/') ||
                path.Split('/').Any(segment =>
                    segment.Length == 0 ||
                    segment is "." or ".." ||
                    segment.Contains(':'))) ||
            request.ResultPaths.Distinct(
                StringComparer.Ordinal).Count() !=
                request.ResultPaths.Length ||
            request.ResultPaths.Any(left =>
                request.ResultPaths.Any(right =>
                    !left.Equals(right, StringComparison.Ordinal) &&
                    (left.StartsWith(
                        $"{right}/",
                        StringComparison.Ordinal) ||
                     right.StartsWith(
                        $"{left}/",
                        StringComparison.Ordinal)))))
        {
            throw new InvalidDataException(
                "The AppContainer result paths are not a strict disjoint allowlist.");
        }
        if (RequiredEnvironmentNames.Any(name =>
                !request.Environment.ContainsKey(name)) ||
            RootBoundEnvironmentNames.Any(name =>
                !IsInsideRoot(root, request.Environment[name])) ||
            request.Environment["CI"] != "1" ||
            request.Environment["NPM_CONFIG_FETCH_RETRIES"] != "0" ||
            request.Environment["NPM_CONFIG_NODE_LINKER"] != "hoisted" ||
            request.Environment["NPM_CONFIG_OFFLINE"] != "true" ||
            request.Environment["NPM_CONFIG_PACKAGE_IMPORT_METHOD"] !=
                "copy" ||
            request.Environment["NPM_CONFIG_REGISTRY"] !=
                "https://registry.npmjs.org/" ||
            request.Environment["NPM_CONFIG_TRUST_LOCKFILE"] != "true" ||
            !request.Environment["SystemRoot"].Equals(
                Environment.GetFolderPath(
                    Environment.SpecialFolder.Windows),
                StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                "The AppContainer environment is not the controlled root-bound environment.");
        }
        if (request.TimeoutMilliseconds is < 1 or > 60_000 ||
            request.MaximumOutputBytes is < 1024 or > 4 * 1024 * 1024)
        {
            throw new InvalidDataException(
                "The AppContainer execution budget is invalid.");
        }
        ValidateReparsePoints(root);
        return request with
        {
            Root = root,
            Application = application,
            Arguments = [.. request.Arguments],
            ResultPaths = [.. request.ResultPaths],
            Environment = new Dictionary<string, string>(
                request.Environment,
                StringComparer.OrdinalIgnoreCase),
        };
    }

    internal static void ValidateReparsePoints(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var directory = pending.Pop();
            foreach (var path in Directory.EnumerateFileSystemEntries(directory))
            {
                var attributes = File.GetAttributes(path);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                {
                    var information =
                        (attributes & FileAttributes.Directory) != 0
                            ? new DirectoryInfo(path) as FileSystemInfo
                            : new FileInfo(path);
                    var target = information.ResolveLinkTarget(
                        returnFinalTarget: true);
                    if (target is null ||
                        !IsInsideRoot(root, target.FullName))
                    {
                        throw new InvalidDataException(
                            "The AppContainer root contains an escaping reparse point.");
                    }
                    continue;
                }
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    pending.Push(path);
                }
            }
        }
    }

    internal static void ValidateNoReparsePoints(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var path = pending.Pop();
            var attributes = File.GetAttributes(path);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidDataException(
                    "An AppContainer result contains a reparse point.");
            }
            if ((attributes & FileAttributes.Directory) == 0)
            {
                continue;
            }
            foreach (var child in
                Directory.EnumerateFileSystemEntries(path))
            {
                pending.Push(child);
            }
        }
    }

    private static void RejectDuplicateProperties(byte[] bytes)
    {
        using var document = JsonDocument.Parse(bytes);
        Visit(document.RootElement);

        static void Visit(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Object)
            {
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var property in element.EnumerateObject())
                {
                    if (!names.Add(property.Name))
                    {
                        throw new InvalidDataException(
                            "The AppContainer request contains duplicate properties.");
                    }
                    Visit(property.Value);
                }
                return;
            }
            if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in element.EnumerateArray())
                {
                    Visit(item);
                }
            }
        }
    }
}
