using System.ComponentModel;
using System.Diagnostics;
using Prodivix.StaticSandbox;

AppContainerProfile? profile = null;
SandboxWorkspace? workspace = null;
LaunchResult? result = null;
Exception? executionError = null;
var cleanupErrors = new List<string>();
var stage = "unknown";

try
{
    var (request, requestDigest) = Protocol.ReadRequest(args);
    stage = request.ProfileName.Split('.')[2];
    WriteProgress(stage, "start", 0);
    var copyIn = Stopwatch.StartNew();
    profile = AppContainerProfile.Create(request.ProfileName);
    workspace = SandboxWorkspace.Create(
        request,
        profile.FolderPath);
    WriteProgress(stage, "copy-in", copyIn.ElapsedMilliseconds);
    var process = Stopwatch.StartNew();
    result = await SandboxedProcess.RunAsync(
        workspace.Request,
        requestDigest,
        profile);
    WriteProgress(stage, "process", process.ElapsedMilliseconds);
    if (result.Process.ExitCode == 0 && !result.Process.TimedOut)
    {
        var copyOut = Stopwatch.StartNew();
        workspace.CopyResultsBack();
        WriteProgress(stage, "copy-out", copyOut.ElapsedMilliseconds);
    }
}
catch (Exception error)
{
    executionError = error;
}
finally
{
    var cleanup = Stopwatch.StartNew();
    try
    {
        workspace?.Dispose();
    }
    catch (Exception error)
    {
        cleanupErrors.Add($"workspace: {error.Message}");
    }
    try
    {
        profile?.Dispose();
    }
    catch (Exception error)
    {
        cleanupErrors.Add($"profile: {error.Message}");
    }
    WriteProgress(stage, "cleanup", cleanup.ElapsedMilliseconds);
}

if (executionError is not null || cleanupErrors.Count > 0 || result is null)
{
    Console.Error.Write(Protocol.Serialize(new
    {
        format = "prodivix.windows-appcontainer-launch-error.v1",
        error = executionError?.Message ??
            "The AppContainer launch did not return a result.",
        nativeErrorCode = executionError is Win32Exception win32
            ? win32.NativeErrorCode
            : (int?)null,
        cleanupErrors,
    }));
    return 1;
}

Console.Out.Write(Protocol.Serialize(result));
return 0;

static void WriteProgress(string stage, string phase, long elapsedMilliseconds)
{
    Console.Error.WriteLine(Protocol.Serialize(new
    {
        format = "prodivix.windows-appcontainer-progress.v1",
        stage,
        phase,
        elapsedMilliseconds,
    }));
}
