using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Prodivix.StaticSandbox;

internal sealed class SafeKernelHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    private SafeKernelHandle() : base(ownsHandle: true)
    {
    }

    internal SafeKernelHandle(IntPtr handle, bool ownsHandle)
        : base(ownsHandle)
    {
        SetHandle(handle);
    }

    protected override bool ReleaseHandle() => NativeMethods.CloseHandle(handle);
}

internal static class NativeMethods
{
    internal const uint ErrorInsufficientBuffer = 122;
    internal const uint Infinite = 0xffffffff;
    internal const uint WaitObject0 = 0;
    internal const uint WaitTimeout = 258;
    internal const uint StillActive = 259;

    internal const uint ExtendedStartupInfoPresent = 0x00080000;
    internal const uint CreateUnicodeEnvironment = 0x00000400;
    internal const uint CreateSuspended = 0x00000004;
    internal const uint CreateNoWindow = 0x08000000;
    internal const uint StartfUseStdHandles = 0x00000100;
    internal const uint HandleFlagInherit = 0x00000001;
    internal const nuint ProcThreadAttributeHandleList = 0x00020002;
    internal const nuint ProcThreadAttributeSecurityCapabilities = 0x00020009;

    internal const uint TokenQuery = 0x0008;
    internal const int TokenIsAppContainer = 29;
    internal const int TokenCapabilities = 30;
    internal const int TokenAppContainerSid = 31;

    internal const uint GenericRead = 0x80000000;
    internal const uint FileShareRead = 0x00000001;
    internal const uint FileShareWrite = 0x00000002;
    internal const uint OpenExisting = 3;
    internal const uint FileAttributeNormal = 0x00000080;

    internal const uint JobObjectLimitActiveProcess = 0x00000008;
    internal const uint JobObjectLimitKillOnJobClose = 0x00002000;
    internal const int JobObjectBasicAccountingInformationClass = 1;
    internal const int JobObjectExtendedLimitInformationClass = 9;

    [StructLayout(LayoutKind.Sequential)]
    internal struct SecurityAttributes
    {
        internal uint Length;
        internal IntPtr SecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)]
        internal bool InheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct StartupInfo
    {
        internal uint Size;
        internal string? Reserved;
        internal string? Desktop;
        internal string? Title;
        internal uint X;
        internal uint Y;
        internal uint XSize;
        internal uint YSize;
        internal uint XCountChars;
        internal uint YCountChars;
        internal uint FillAttribute;
        internal uint Flags;
        internal ushort ShowWindow;
        internal ushort Reserved2Size;
        internal IntPtr Reserved2;
        internal IntPtr StandardInput;
        internal IntPtr StandardOutput;
        internal IntPtr StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct StartupInfoEx
    {
        internal StartupInfo StartupInfo;
        internal IntPtr AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ProcessInformation
    {
        internal IntPtr Process;
        internal IntPtr Thread;
        internal uint ProcessId;
        internal uint ThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SecurityCapabilities
    {
        internal IntPtr AppContainerSid;
        internal IntPtr Capabilities;
        internal uint CapabilityCount;
        internal uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct JobObjectBasicLimitInformation
    {
        internal long PerProcessUserTimeLimit;
        internal long PerJobUserTimeLimit;
        internal uint LimitFlags;
        internal UIntPtr MinimumWorkingSetSize;
        internal UIntPtr MaximumWorkingSetSize;
        internal uint ActiveProcessLimit;
        internal UIntPtr Affinity;
        internal uint PriorityClass;
        internal uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct IoCounters
    {
        internal ulong ReadOperationCount;
        internal ulong WriteOperationCount;
        internal ulong OtherOperationCount;
        internal ulong ReadTransferCount;
        internal ulong WriteTransferCount;
        internal ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct JobObjectExtendedLimitInformation
    {
        internal JobObjectBasicLimitInformation BasicLimitInformation;
        internal IoCounters IoInfo;
        internal UIntPtr ProcessMemoryLimit;
        internal UIntPtr JobMemoryLimit;
        internal UIntPtr PeakProcessMemoryUsed;
        internal UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct JobObjectBasicAccountingInformation
    {
        internal long TotalUserTime;
        internal long TotalKernelTime;
        internal long ThisPeriodTotalUserTime;
        internal long ThisPeriodTotalKernelTime;
        internal uint TotalPageFaultCount;
        internal uint TotalProcesses;
        internal uint ActiveProcesses;
        internal uint TotalTerminatedProcesses;
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode,
        ExactSpelling = true)]
    internal static extern int CreateAppContainerProfile(
        string appContainerName,
        string displayName,
        string description,
        IntPtr capabilities,
        uint capabilityCount,
        out IntPtr appContainerSid);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode,
        ExactSpelling = true)]
    internal static extern int DeleteAppContainerProfile(
        string appContainerName);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode,
        ExactSpelling = true)]
    internal static extern int GetAppContainerFolderPath(
        string appContainerSid,
        out IntPtr path);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool OpenProcessToken(
        IntPtr processHandle,
        uint desiredAccess,
        out SafeKernelHandle tokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetTokenInformation(
        SafeKernelHandle tokenHandle,
        int tokenInformationClass,
        IntPtr tokenInformation,
        uint tokenInformationLength,
        out uint returnLength);

    [DllImport("advapi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool EqualSid(IntPtr firstSid, IntPtr secondSid);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode,
        SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ConvertSidToStringSidW(
        IntPtr sid,
        out IntPtr stringSid);

    [DllImport("advapi32.dll")]
    internal static extern IntPtr FreeSid(IntPtr sid);

    [DllImport("kernel32.dll")]
    internal static extern IntPtr LocalFree(IntPtr memory);

    [DllImport("ole32.dll")]
    internal static extern void CoTaskMemFree(IntPtr memory);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool InitializeProcThreadAttributeList(
        IntPtr attributeList,
        int attributeCount,
        uint flags,
        ref nuint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool UpdateProcThreadAttribute(
        IntPtr attributeList,
        uint flags,
        nuint attribute,
        IntPtr value,
        nuint size,
        IntPtr previousValue,
        IntPtr returnSize);

    [DllImport("kernel32.dll")]
    internal static extern void DeleteProcThreadAttributeList(
        IntPtr attributeList);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode,
        SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CreateProcessW(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref StartupInfoEx startupInfo,
        out ProcessInformation processInformation);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode,
        SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetEnvironmentVariableW(
        string name,
        string? value);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CreatePipe(
        out SafeFileHandle readPipe,
        out SafeFileHandle writePipe,
        ref SecurityAttributes pipeAttributes,
        uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetHandleInformation(
        SafeFileHandle handle,
        uint mask,
        uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode,
        SetLastError = true)]
    internal static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        ref SecurityAttributes securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern SafeKernelHandle CreateJobObjectW(
        IntPtr jobAttributes,
        string? name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetInformationJobObject(
        SafeKernelHandle job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool QueryInformationJobObject(
        SafeKernelHandle job,
        int informationClass,
        IntPtr information,
        uint informationLength,
        out uint returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool AssignProcessToJobObject(
        SafeKernelHandle job,
        SafeKernelHandle process);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool TerminateJobObject(
        SafeKernelHandle job,
        uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern uint ResumeThread(SafeKernelHandle thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern uint WaitForSingleObject(
        SafeKernelHandle handle,
        uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetExitCodeProcess(
        SafeKernelHandle process,
        out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseHandle(IntPtr handle);
}
