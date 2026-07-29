namespace Prodivix.StaticSandbox;

internal sealed class SandboxWorkspace : IDisposable
{
    private const int MaximumFiles = 100_000;
    private const int MaximumDirectories = 100_000;
    private const long MaximumBytes = 2L * 1024 * 1024 * 1024;
    private bool _disposed;

    private SandboxWorkspace(
        string sourceRoot,
        string root,
        LaunchRequest request)
    {
        SourceRoot = sourceRoot;
        Root = root;
        Request = request;
    }

    internal string SourceRoot { get; }
    internal string Root { get; }
    internal LaunchRequest Request { get; }

    internal static SandboxWorkspace Create(
        LaunchRequest request,
        string profileFolder)
    {
        var root = Path.Combine(profileFolder, "workspace");
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
        Directory.CreateDirectory(root);
        CopyTree(request.Root, root);
        var mappedEnvironment = request.Environment.ToDictionary(
            entry => entry.Key,
            entry => MapValue(request.Root, root, entry.Value),
            StringComparer.OrdinalIgnoreCase);
        var profileHome = Path.Combine(profileFolder, "Profile");
        var profileTemp = Path.Combine(profileFolder, "Temp");
        var profileAppData = Path.Combine(profileFolder, "AppData");
        Directory.CreateDirectory(profileHome);
        Directory.CreateDirectory(profileTemp);
        Directory.CreateDirectory(profileAppData);
        mappedEnvironment["APPDATA"] = profileAppData;
        mappedEnvironment["HOME"] = profileHome;
        mappedEnvironment["LOCALAPPDATA"] = profileFolder;
        mappedEnvironment["TEMP"] = profileTemp;
        mappedEnvironment["TMP"] = profileTemp;
        mappedEnvironment["USERPROFILE"] = profileHome;
        var mappedArguments = request.Arguments
            .Select(argument => MapValue(
                request.Root,
                root,
                argument))
            .ToArray();
        return new SandboxWorkspace(
            request.Root,
            root,
            request with
            {
                Root = root,
                Application = MapPath(
                    request.Root,
                    root,
                    request.Application),
                Arguments = mappedArguments,
                Environment = mappedEnvironment,
            });
    }

    internal void CopyResultsBack()
    {
        Protocol.ValidateReparsePoints(Root);
        foreach (var relativePath in Request.ResultPaths)
        {
            var sourcePath = Path.Combine(
                Root,
                relativePath.Replace(
                    '/',
                    Path.DirectorySeparatorChar));
            var destinationPath = Path.Combine(
                SourceRoot,
                relativePath.Replace(
                    '/',
                    Path.DirectorySeparatorChar));
            if (Directory.Exists(sourcePath))
            {
                Protocol.ValidateNoReparsePoints(sourcePath);
                DeleteDirectoryBounded(destinationPath);
                CopyTree(sourcePath, destinationPath);
                continue;
            }
            if (!File.Exists(sourcePath))
            {
                throw new InvalidDataException(
                    "An allowlisted AppContainer result is missing.");
            }
            Protocol.ValidateNoReparsePoints(sourcePath);
            Directory.CreateDirectory(
                Path.GetDirectoryName(destinationPath)!);
            File.Copy(sourcePath, destinationPath, overwrite: true);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }
        _disposed = true;
        DeleteDirectoryBounded(Root);
    }

    private static void DeleteDirectoryBounded(string path)
    {
        var deadline = DateTime.UtcNow.AddSeconds(60);
        var delayMilliseconds = 50;
        Exception? lastError = null;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                if (!Directory.Exists(path))
                {
                    return;
                }
                Directory.Delete(path, recursive: true);
                if (!Directory.Exists(path))
                {
                    return;
                }
            }
            catch (Exception error) when (
                error is IOException or UnauthorizedAccessException)
            {
                lastError = error;
            }
            Thread.Sleep(delayMilliseconds);
            delayMilliseconds = Math.Min(
                delayMilliseconds * 2,
                500);
        }
        throw new IOException(
            "The AppContainer workspace remained after its cleanup deadline.",
            lastError);
    }

    private static void CopyTree(string sourceRoot, string destinationRoot)
    {
        var fileCount = 0;
        var directoryCount = 0;
        long byteCount = 0;
        var pending = new Stack<(string Source, string Destination)>();
        pending.Push((sourceRoot, destinationRoot));
        while (pending.Count > 0)
        {
            var (source, destination) = pending.Pop();
            directoryCount++;
            if (directoryCount > MaximumDirectories)
            {
                throw new InvalidDataException(
                    "The sandbox workspace exceeds its directory budget.");
            }
            Directory.CreateDirectory(destination);
            foreach (var sourcePath in
                Directory.EnumerateFileSystemEntries(source))
            {
                var name = Path.GetFileName(sourcePath);
                var destinationPath = Path.Combine(destination, name);
                var attributes = File.GetAttributes(sourcePath);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    var directorySource = sourcePath;
                    if ((attributes & FileAttributes.ReparsePoint) != 0)
                    {
                        directorySource = new DirectoryInfo(sourcePath)
                            .ResolveLinkTarget(returnFinalTarget: true)
                            ?.FullName ?? throw new InvalidDataException(
                                "A sandbox directory link has no target.");
                    }
                    pending.Push((directorySource, destinationPath));
                    continue;
                }
                fileCount++;
                var fileSource = sourcePath;
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                {
                    fileSource = new FileInfo(sourcePath)
                        .ResolveLinkTarget(returnFinalTarget: true)
                        ?.FullName ?? throw new InvalidDataException(
                            "A sandbox file link has no target.");
                }
                var length = new FileInfo(fileSource).Length;
                byteCount = checked(byteCount + length);
                if (fileCount > MaximumFiles || byteCount > MaximumBytes)
                {
                    throw new InvalidDataException(
                        "The sandbox workspace exceeds its materialization budget.");
                }
                Directory.CreateDirectory(
                    Path.GetDirectoryName(destinationPath)!);
                File.Copy(fileSource, destinationPath, overwrite: true);
            }
        }
    }

    private static string MapPath(
        string sourceRoot,
        string destinationRoot,
        string sourcePath)
    {
        if (!Protocol.IsInsideRoot(sourceRoot, sourcePath))
        {
            throw new InvalidDataException(
                "The sandbox application escaped its source root.");
        }
        var relativePath = Path.GetRelativePath(sourceRoot, sourcePath);
        return relativePath == "."
            ? destinationRoot
            : Path.Combine(destinationRoot, relativePath);
    }

    private static string MapValue(
        string sourceRoot,
        string destinationRoot,
        string value)
    {
        if (Path.IsPathFullyQualified(value) &&
            Protocol.IsInsideRoot(sourceRoot, value))
        {
            return MapPath(sourceRoot, destinationRoot, value);
        }
        var prefix = $"{sourceRoot}{Path.DirectorySeparatorChar}";
        var index = value.IndexOf(
            prefix,
            StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return value;
        }
        return $"{value[..index]}{destinationRoot}" +
            $"{Path.DirectorySeparatorChar}" +
            value[(index + prefix.Length)..];
    }
}
