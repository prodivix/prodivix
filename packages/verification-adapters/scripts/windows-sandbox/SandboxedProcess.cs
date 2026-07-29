using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Prodivix.StaticSandbox;

internal static class SandboxedProcess
{
    private const int ActiveProcessLimit = 64;
    private const uint ForcedTerminationExitCode = 0x50525658;
    private static readonly TimeSpan DescendantExitGrace =
        TimeSpan.FromSeconds(15);

    internal static async Task<LaunchResult> RunAsync(
        LaunchRequest request,
        string requestDigest,
        AppContainerProfile profile)
    {
        using var job = CreateBoundedJob();
        using var standardOutput = CreatePipe();
        using var standardError = CreatePipe();
        using var standardInput = OpenNullInput();
        using var attributes = CreateAttributeList(
            profile.Sid,
            [
                standardInput.DangerousGetHandle(),
                standardOutput.Write.DangerousGetHandle(),
                standardError.Write.DangerousGetHandle(),
            ]);
        ReplaceInheritedEnvironment(request.Environment);

        var startupInfo = new NativeMethods.StartupInfoEx
        {
            StartupInfo = new NativeMethods.StartupInfo
            {
                Size = checked((uint)Marshal.SizeOf<
                    NativeMethods.StartupInfoEx>()),
                Flags = NativeMethods.StartfUseStdHandles,
                StandardInput = standardInput.DangerousGetHandle(),
                StandardOutput =
                    standardOutput.Write.DangerousGetHandle(),
                StandardError =
                    standardError.Write.DangerousGetHandle(),
            },
            AttributeList = attributes.Pointer,
        };
        var commandLine = new StringBuilder(
            BuildCommandLine(request.Application, request.Arguments));
        if (!NativeMethods.CreateProcessW(
                request.Application,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                inheritHandles: true,
                NativeMethods.ExtendedStartupInfoPresent |
                    NativeMethods.CreateUnicodeEnvironment |
                    NativeMethods.CreateSuspended |
                    NativeMethods.CreateNoWindow,
                IntPtr.Zero,
                request.Root,
                ref startupInfo,
                out var processInformation))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process could not be created.");
        }

        using var process = new SafeKernelHandle(
            processInformation.Process,
            ownsHandle: true);
        using var thread = new SafeKernelHandle(
            processInformation.Thread,
            ownsHandle: true);
        standardOutput.DisposeWrite();
        standardError.DisposeWrite();

        if (!NativeMethods.AssignProcessToJobObject(job, process))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process could not enter its Job Object.");
        }
        var token = profile.AttestProcessToken(process);
        if (!token.IsAppContainer ||
            !token.SidMatched ||
            token.CapabilityCount != 0)
        {
            throw new InvalidOperationException(
                "The launched process did not receive the exact zero-capability AppContainer token.");
        }

        using var stdoutStream = new FileStream(
            standardOutput.Read,
            FileAccess.Read,
            bufferSize: 16_384,
            isAsync: false);
        standardOutput.DetachRead();
        using var stderrStream = new FileStream(
            standardError.Read,
            FileAccess.Read,
            bufferSize: 16_384,
            isAsync: false);
        standardError.DetachRead();
        var stdoutTask = CaptureOutputAsync(
            stdoutStream,
            request.MaximumOutputBytes);
        var stderrTask = CaptureOutputAsync(
            stderrStream,
            request.MaximumOutputBytes);

        if (NativeMethods.ResumeThread(thread) == uint.MaxValue)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process could not be resumed.");
        }
        var waitResult = await Task.Run(() =>
            NativeMethods.WaitForSingleObject(
                process,
                checked((uint)request.TimeoutMilliseconds)));
        var timedOut = waitResult == NativeMethods.WaitTimeout;
        if (timedOut)
        {
            TerminateJob(job);
            EnsureProcessExited(process);
        }
        else if (waitResult != NativeMethods.WaitObject0)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "Waiting for the AppContainer process failed.");
        }

        if (!NativeMethods.GetExitCodeProcess(process, out var rawExitCode) ||
            rawExitCode == NativeMethods.StillActive)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer exit code is unavailable.");
        }

        var processTreeClean = await WaitForProcessTreeAsync(job);
        if (!processTreeClean)
        {
            TerminateJob(job);
            processTreeClean = QueryAccounting(job).ActiveProcesses == 0;
        }
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        var accounting = QueryAccounting(job);

        return new LaunchResult(
            Protocol.ResultFormat,
            requestDigest,
            "windows-appcontainer",
            new AppContainerReceipt(
                profile.Name,
                profile.SidText,
                token.IsAppContainer,
                token.SidMatched,
                token.CapabilityCount,
                [],
                ProfileStorageBound: true),
            new JobReceipt(
                KillOnClose: true,
                ActiveProcessLimit,
                accounting.TotalProcesses,
                accounting.ActiveProcesses,
                accounting.TotalTerminatedProcesses,
                processTreeClean &&
                    accounting.ActiveProcesses == 0),
            new ProcessReceipt(
                request.Application,
                [.. request.Arguments],
                request.Root,
                Protocol.EnvironmentDigest(request.Environment),
                unchecked((int)rawExitCode),
                Signal: null,
                timedOut,
                stdout,
                stderr));
    }

    private static SafeKernelHandle CreateBoundedJob()
    {
        var job = NativeMethods.CreateJobObjectW(
            IntPtr.Zero,
            name: null);
        if (job.IsInvalid)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer Job Object could not be created.");
        }
        var limits = new NativeMethods.JobObjectExtendedLimitInformation
        {
            BasicLimitInformation =
                new NativeMethods.JobObjectBasicLimitInformation
                {
                    LimitFlags =
                        NativeMethods.JobObjectLimitKillOnJobClose |
                        NativeMethods.JobObjectLimitActiveProcess,
                    ActiveProcessLimit = ActiveProcessLimit,
                },
        };
        var size = Marshal.SizeOf<
            NativeMethods.JobObjectExtendedLimitInformation>();
        var pointer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, pointer, fDeleteOld: false);
            if (!NativeMethods.SetInformationJobObject(
                    job,
                    NativeMethods.JobObjectExtendedLimitInformationClass,
                    pointer,
                    checked((uint)size)))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer Job Object limits could not be applied.");
            }
            return job;
        }
        catch
        {
            job.Dispose();
            throw;
        }
        finally
        {
            Marshal.FreeHGlobal(pointer);
        }
    }

    private static InheritedPipe CreatePipe()
    {
        var security = new NativeMethods.SecurityAttributes
        {
            Length = checked((uint)Marshal.SizeOf<
                NativeMethods.SecurityAttributes>()),
            SecurityDescriptor = IntPtr.Zero,
            InheritHandle = true,
        };
        if (!NativeMethods.CreatePipe(
                out var read,
                out var write,
                ref security,
                0))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "An AppContainer output pipe could not be created.");
        }
        if (!NativeMethods.SetHandleInformation(
                read,
                NativeMethods.HandleFlagInherit,
                0))
        {
            read.Dispose();
            write.Dispose();
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "An AppContainer output pipe could not be isolated.");
        }
        return new InheritedPipe(read, write);
    }

    private static SafeFileHandle OpenNullInput()
    {
        var security = new NativeMethods.SecurityAttributes
        {
            Length = checked((uint)Marshal.SizeOf<
                NativeMethods.SecurityAttributes>()),
            SecurityDescriptor = IntPtr.Zero,
            InheritHandle = true,
        };
        var handle = NativeMethods.CreateFileW(
            "NUL",
            NativeMethods.GenericRead,
            NativeMethods.FileShareRead |
                NativeMethods.FileShareWrite,
            ref security,
            NativeMethods.OpenExisting,
            NativeMethods.FileAttributeNormal,
            IntPtr.Zero);
        if (handle.IsInvalid)
        {
            handle.Dispose();
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer null input handle could not be opened.");
        }
        return handle;
    }

    private static AttributeList CreateAttributeList(
        IntPtr appContainerSid,
        IReadOnlyList<IntPtr> inheritedHandles)
    {
        nuint size = 0;
        _ = NativeMethods.InitializeProcThreadAttributeList(
            IntPtr.Zero,
            2,
            0,
            ref size);
        if (size == 0 ||
            Marshal.GetLastWin32Error() !=
                NativeMethods.ErrorInsufficientBuffer)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process attribute list could not be sized.");
        }
        var pointer = Marshal.AllocHGlobal(checked((int)size));
        var securityPointer = IntPtr.Zero;
        var handlePointer = IntPtr.Zero;
        try
        {
            if (!NativeMethods.InitializeProcThreadAttributeList(
                    pointer,
                    2,
                    0,
                    ref size))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer process attribute list could not be initialized.");
            }
            securityPointer = Marshal.AllocHGlobal(
                Marshal.SizeOf<NativeMethods.SecurityCapabilities>());
            Marshal.StructureToPtr(
                new NativeMethods.SecurityCapabilities
                {
                    AppContainerSid = appContainerSid,
                    Capabilities = IntPtr.Zero,
                    CapabilityCount = 0,
                    Reserved = 0,
                },
                securityPointer,
                fDeleteOld: false);
            if (!NativeMethods.UpdateProcThreadAttribute(
                    pointer,
                    0,
                    NativeMethods.ProcThreadAttributeSecurityCapabilities,
                    securityPointer,
                    checked((nuint)Marshal.SizeOf<
                        NativeMethods.SecurityCapabilities>()),
                    IntPtr.Zero,
                    IntPtr.Zero))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer security capability attribute could not be applied.");
            }
            handlePointer = Marshal.AllocHGlobal(
                checked(IntPtr.Size * inheritedHandles.Count));
            for (var index = 0; index < inheritedHandles.Count; index++)
            {
                Marshal.WriteIntPtr(
                    handlePointer,
                    index * IntPtr.Size,
                    inheritedHandles[index]);
            }
            if (!NativeMethods.UpdateProcThreadAttribute(
                    pointer,
                    0,
                    NativeMethods.ProcThreadAttributeHandleList,
                    handlePointer,
                    checked((nuint)(
                        IntPtr.Size * inheritedHandles.Count)),
                    IntPtr.Zero,
                    IntPtr.Zero))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer inherited handle list could not be applied.");
            }
            return new AttributeList(
                pointer,
                securityPointer,
                handlePointer);
        }
        catch
        {
            if (pointer != IntPtr.Zero)
            {
                NativeMethods.DeleteProcThreadAttributeList(pointer);
                Marshal.FreeHGlobal(pointer);
            }
            if (securityPointer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(securityPointer);
            }
            if (handlePointer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(handlePointer);
            }
            throw;
        }
    }

    private static void ReplaceInheritedEnvironment(
        IReadOnlyDictionary<string, string> environment)
    {
        var existingNames = Environment.GetEnvironmentVariables()
            .Keys
            .Cast<object>()
            .Select(key => key.ToString())
            .Where(key => !string.IsNullOrEmpty(key))
            .Cast<string>()
            .ToArray();
        foreach (var name in existingNames)
        {
            if (!NativeMethods.SetEnvironmentVariableW(name, null))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "A host environment variable could not be removed.");
            }
        }
        foreach (var entry in environment)
        {
            if (!NativeMethods.SetEnvironmentVariableW(
                    entry.Key,
                    entry.Value))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "A controlled environment variable could not be applied.");
            }
        }
    }

    private static string BuildCommandLine(
        string application,
        IReadOnlyList<string> arguments) =>
        string.Join(
            ' ',
            new[] { application }
                .Concat(arguments)
                .Select(QuoteArgument));

    private static string QuoteArgument(string argument)
    {
        if (argument.Length > 0 &&
            !argument.Any(character =>
                char.IsWhiteSpace(character) || character == '"'))
        {
            return argument;
        }
        var result = new StringBuilder(argument.Length + 2);
        result.Append('"');
        var backslashes = 0;
        foreach (var character in argument)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static async Task<OutputReceipt> CaptureOutputAsync(
        Stream stream,
        int maximumBytes)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        using var capture = new MemoryStream(
            capacity: Math.Min(maximumBytes, 64 * 1024));
        var buffer = new byte[16_384];
        long byteLength = 0;
        while (true)
        {
            var count = await stream.ReadAsync(buffer);
            if (count == 0)
            {
                break;
            }
            hash.AppendData(buffer, 0, count);
            byteLength += count;
            var remaining = maximumBytes - checked((int)capture.Length);
            if (remaining > 0)
            {
                capture.Write(buffer, 0, Math.Min(remaining, count));
            }
        }
        return new OutputReceipt(
            Encoding.UTF8.GetString(capture.GetBuffer(), 0,
                checked((int)capture.Length)),
            $"sha256-{Convert.ToHexStringLower(hash.GetHashAndReset())}",
            byteLength,
            byteLength > maximumBytes);
    }

    private static async Task<bool> WaitForProcessTreeAsync(
        SafeKernelHandle job)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.Elapsed < DescendantExitGrace)
        {
            if (QueryAccounting(job).ActiveProcesses == 0)
            {
                return true;
            }
            await Task.Delay(25);
        }
        return false;
    }

    private static NativeMethods.JobObjectBasicAccountingInformation
        QueryAccounting(SafeKernelHandle job)
    {
        var size = Marshal.SizeOf<
            NativeMethods.JobObjectBasicAccountingInformation>();
        var pointer = Marshal.AllocHGlobal(size);
        try
        {
            if (!NativeMethods.QueryInformationJobObject(
                    job,
                    NativeMethods.JobObjectBasicAccountingInformationClass,
                    pointer,
                    checked((uint)size),
                    out _))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "The AppContainer Job Object accounting could not be read.");
            }
            return Marshal.PtrToStructure<
                NativeMethods.JobObjectBasicAccountingInformation>(pointer);
        }
        finally
        {
            Marshal.FreeHGlobal(pointer);
        }
    }

    private static void TerminateJob(SafeKernelHandle job)
    {
        if (!NativeMethods.TerminateJobObject(
                job,
                ForcedTerminationExitCode))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The AppContainer process tree could not be terminated.");
        }
    }

    private static void EnsureProcessExited(SafeKernelHandle process)
    {
        var waitResult = NativeMethods.WaitForSingleObject(
            process,
            15_000);
        if (waitResult != NativeMethods.WaitObject0)
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "The terminated AppContainer process did not exit.");
        }
    }

    private sealed class InheritedPipe : IDisposable
    {
        internal InheritedPipe(
            SafeFileHandle read,
            SafeFileHandle write)
        {
            Read = read;
            Write = write;
        }

        internal SafeFileHandle Read { get; private set; }
        internal SafeFileHandle Write { get; }

        internal void DisposeWrite() => Write.Dispose();

        internal void DetachRead() =>
            Read = new SafeFileHandle(IntPtr.Zero, ownsHandle: false);

        public void Dispose()
        {
            Read.Dispose();
            Write.Dispose();
        }
    }

    private sealed class AttributeList : IDisposable
    {
        private IntPtr _securityPointer;
        private IntPtr _handlePointer;

        internal AttributeList(
            IntPtr pointer,
            IntPtr securityPointer,
            IntPtr handlePointer)
        {
            Pointer = pointer;
            _securityPointer = securityPointer;
            _handlePointer = handlePointer;
        }

        internal IntPtr Pointer { get; private set; }

        public void Dispose()
        {
            if (Pointer != IntPtr.Zero)
            {
                NativeMethods.DeleteProcThreadAttributeList(Pointer);
                Marshal.FreeHGlobal(Pointer);
                Pointer = IntPtr.Zero;
            }
            if (_securityPointer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_securityPointer);
                _securityPointer = IntPtr.Zero;
            }
            if (_handlePointer != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_handlePointer);
                _handlePointer = IntPtr.Zero;
            }
        }
    }

}
