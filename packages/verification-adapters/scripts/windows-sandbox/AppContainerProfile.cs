using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Prodivix.StaticSandbox;

internal sealed class AppContainerProfile : IDisposable
{
    private bool _disposed;

    private AppContainerProfile(
        string name,
        IntPtr sid,
        string sidText,
        string folderPath)
    {
        Name = name;
        Sid = sid;
        SidText = sidText;
        FolderPath = folderPath;
    }

    internal string Name { get; }
    internal IntPtr Sid { get; private set; }
    internal string SidText { get; }
    internal string FolderPath { get; }

    internal static AppContainerProfile Create(string name)
    {
        ThrowIfFailedHResult(
            NativeMethods.DeleteAppContainerProfile(name),
            "The stale AppContainer profile could not be deleted.");
        ThrowIfFailedHResult(
            NativeMethods.CreateAppContainerProfile(
                name,
                "Prodivix controlled static adapter",
                "Ephemeral zero-capability static verification sandbox",
                IntPtr.Zero,
                0,
                out var sid),
            "The AppContainer profile could not be created.");
        if (sid == IntPtr.Zero)
        {
            throw new InvalidOperationException(
                "The AppContainer profile returned no SID.");
        }
        var sidText = SidToString(sid);
        var folderPathPointer = IntPtr.Zero;
        try
        {
            ThrowIfFailedHResult(
                NativeMethods.GetAppContainerFolderPath(
                    sidText,
                    out folderPathPointer),
                "The AppContainer profile folder could not be resolved.");
            var folderPath = Marshal.PtrToStringUni(folderPathPointer) ??
                throw new InvalidOperationException(
                    "The AppContainer profile folder is empty.");
            return new AppContainerProfile(
                name,
                sid,
                sidText,
                Path.GetFullPath(folderPath));
        }
        catch
        {
            NativeMethods.FreeSid(sid);
            NativeMethods.DeleteAppContainerProfile(name);
            throw;
        }
        finally
        {
            if (folderPathPointer != IntPtr.Zero)
                NativeMethods.CoTaskMemFree(folderPathPointer);
        }
    }

    internal TokenAttestation AttestProcessToken(SafeKernelHandle process)
    {
        if (!NativeMethods.OpenProcessToken(
                process.DangerousGetHandle(),
                NativeMethods.TokenQuery,
                out var token))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process token could not be opened.");
        }
        using (token)
        {
            var isAppContainer = ReadTokenInt32(
                token,
                NativeMethods.TokenIsAppContainer) != 0;
            var capabilityCount = ReadTokenGroupCount(token);
            return new TokenAttestation(
                isAppContainer,
                TokenAppContainerSidMatches(token, Sid),
                checked((int)capabilityCount));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }
        _disposed = true;
        if (Sid != IntPtr.Zero)
        {
            NativeMethods.FreeSid(Sid);
            Sid = IntPtr.Zero;
        }
        DeleteProfileBounded();
    }

    private void DeleteProfileBounded()
    {
        var deadline = DateTime.UtcNow.AddSeconds(60);
        var delayMilliseconds = 50;
        var deletionAccepted = false;
        var lastResult = 0;
        Exception? lastError = null;
        while (DateTime.UtcNow < deadline)
        {
            if (!deletionAccepted)
            {
                lastResult =
                    NativeMethods.DeleteAppContainerProfile(Name);
                deletionAccepted = lastResult >= 0;
            }
            if (deletionAccepted)
            {
                try
                {
                    if (Directory.Exists(FolderPath))
                    {
                        Directory.Delete(FolderPath, recursive: true);
                    }
                    if (!Directory.Exists(FolderPath))
                    {
                        return;
                    }
                }
                catch (Exception error) when (
                    error is IOException or UnauthorizedAccessException)
                {
                    lastError = error;
                }
            }
            Thread.Sleep(delayMilliseconds);
            delayMilliseconds = Math.Min(
                delayMilliseconds * 2,
                500);
        }
        if (!deletionAccepted)
        {
            throw new InvalidOperationException(
                "The AppContainer profile could not be deleted before its cleanup deadline. " +
                $"HRESULT=0x{lastResult:x8}.");
        }
        throw new IOException(
            "The AppContainer profile folder remained after its cleanup deadline.",
            lastError);
    }

    private static int ReadTokenInt32(
        SafeKernelHandle token,
        int informationClass)
    {
        var buffer = Marshal.AllocHGlobal(sizeof(int));
        try
        {
            if (!NativeMethods.GetTokenInformation(
                    token,
                    informationClass,
                    buffer,
                    sizeof(int),
                    out _))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer token information could not be read.");
            }
            return Marshal.ReadInt32(buffer);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static uint ReadTokenGroupCount(SafeKernelHandle token)
    {
        NativeMethods.GetTokenInformation(
            token,
            NativeMethods.TokenCapabilities,
            IntPtr.Zero,
            0,
            out var required);
        if (required < sizeof(uint) &&
            Marshal.GetLastWin32Error() !=
                NativeMethods.ErrorInsufficientBuffer)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer capability buffer could not be sized.");
        }
        var buffer = Marshal.AllocHGlobal(checked((int)required));
        try
        {
            if (!NativeMethods.GetTokenInformation(
                    token,
                    NativeMethods.TokenCapabilities,
                    buffer,
                    required,
                    out _))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer capabilities could not be read.");
            }
            return unchecked((uint)Marshal.ReadInt32(buffer));
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static bool TokenAppContainerSidMatches(
        SafeKernelHandle token,
        IntPtr expectedSid)
    {
        NativeMethods.GetTokenInformation(
            token,
            NativeMethods.TokenAppContainerSid,
            IntPtr.Zero,
            0,
            out var required);
        if (required < IntPtr.Size &&
            Marshal.GetLastWin32Error() !=
                NativeMethods.ErrorInsufficientBuffer)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer token SID buffer could not be sized.");
        }
        var buffer = Marshal.AllocHGlobal(checked((int)required));
        try
        {
            if (!NativeMethods.GetTokenInformation(
                    token,
                    NativeMethods.TokenAppContainerSid,
                    buffer,
                    required,
                    out _))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer token SID could not be read.");
            }
            var actualSid = Marshal.ReadIntPtr(buffer);
            return actualSid != IntPtr.Zero &&
                NativeMethods.EqualSid(expectedSid, actualSid);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string SidToString(IntPtr sid)
    {
        if (!NativeMethods.ConvertSidToStringSidW(sid, out var textPointer))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer SID could not be encoded.");
        }
        try
        {
            return Marshal.PtrToStringUni(textPointer) ??
                throw new InvalidOperationException(
                    "The AppContainer SID string is empty.");
        }
        finally
        {
            NativeMethods.LocalFree(textPointer);
        }
    }

    private static void ThrowIfFailedHResult(int result, string message)
    {
        if (result < 0)
        {
            throw new InvalidOperationException(
                $"{message} HRESULT=0x{result:x8}.");
        }
    }
}

internal sealed record TokenAttestation(
    bool IsAppContainer,
    bool SidMatched,
    int CapabilityCount);
