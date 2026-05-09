import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Config } from './config/Config.js';
import type { Logger } from './config/Logger.js';

import { PathValidator } from './infrastructure/security/PathValidator.js';
import { AdbProcessRunner } from './infrastructure/adb/AdbProcessRunner.js';
import { AdbAdapter } from './infrastructure/adb/AdbAdapter.js';
import { AdbAppController } from './infrastructure/adb/AdbAppController.js';
import { ComposePreviewScanner } from './infrastructure/scanners/ComposePreviewScanner.js';
import { ProjectScanner } from './infrastructure/scanners/ProjectScanner.js';
import { MaestroAdapter } from './infrastructure/maestro/MaestroAdapter.js';
import { MaestroProcessRunner } from './infrastructure/maestro/MaestroProcessRunner.js';
import { LogcatNetworkInspector } from './infrastructure/network/KtorLogcatNetworkInspector.js';
import { GradleAdapter } from './infrastructure/build/GradleAdapter.js';
import { GradleProcessRunner } from './infrastructure/build/GradleProcessRunner.js';
import { JUnitXmlParser } from './infrastructure/build/parsers/JUnitXmlParser.js';
import { LintXmlParser } from './infrastructure/build/parsers/LintXmlParser.js';

import {
  ListDevicesUseCase,
  GetLogcatUseCase,
  ListComposePreviewsUseCase,
  GetComposePreviewSourceUseCase,
  GetComposePreviewsTreeUseCase,
  GetNetworkCallsUseCase,
  GetProjectStructureUseCase,
  ResizeLogcatBufferUseCase,
  RunGradleTaskUseCase,
  GetAppErrorsUseCase,
  InspectPackagesUseCase,
  TakeScreenshotUseCase,
  DumpUiUseCase,
  InputTapUseCase,
  InputTextUseCase,
  InputKeyUseCase,
  InputSwipeUseCase,
  SetInputVisualizationUseCase,
  TapByTextUseCase,
  TapByResourceIdUseCase,
  SetTextUseCase,
  WaitForTextUseCase,
  WaitForResourceIdUseCase,
  WaitForIdleUseCase,
  LaunchAppUseCase,
  ForceStopAppUseCase,
  ClearAppDataUseCase,
  RunInstrumentedTestsUseCase,
  InstallApkUseCase,
  RunMaestroFlowUseCase,
  ListMaestroFlowsUseCase,
  ValidateMaestroFlowUseCase,
} from './application/index.js';

import { devicesToolName, devicesToolDefinition, buildDevicesToolHandler } from './presentation/tools/devicesTool.js';
import { logcatToolName, logcatToolDefinition, buildLogcatToolHandler } from './presentation/tools/logcatTool.js';
import {
  listPreviewsToolName,
  listPreviewsToolDefinition,
  buildListPreviewsHandler,
  getPreviewSourceToolName,
  getPreviewSourceToolDefinition,
  buildGetPreviewSourceHandler,
  previewsTreeToolName,
  previewsTreeToolDefinition,
  buildPreviewsTreeHandler,
} from './presentation/tools/previewsTool.js';
import {
  projectStructureToolName,
  projectStructureToolDefinition,
  buildProjectStructureHandler,
} from './presentation/tools/projectStructureTool.js';
import {
  networkCallsToolName,
  networkCallsToolDefinition,
  buildNetworkCallsHandler,
} from './presentation/tools/networkTool.js';
import {
  resizeLogcatBufferToolName,
  resizeLogcatBufferToolDefinition,
  buildResizeLogcatBufferHandler,
} from './presentation/tools/logcatBufferTool.js';
import {
  runGradleTaskToolName,
  runGradleTaskToolDefinition,
  buildRunGradleTaskHandler,
} from './presentation/tools/gradleTool.js';
import {
  appErrorsToolName,
  appErrorsToolDefinition,
  buildAppErrorsHandler,
} from './presentation/tools/appErrorsTool.js';
import {
  inspectPackagesToolName,
  inspectPackagesToolDefinition,
  buildInspectPackagesHandler,
} from './presentation/tools/inspectPackagesTool.js';
import {
  takeScreenshotToolName,
  takeScreenshotToolDefinition,
  buildTakeScreenshotHandler,
  dumpUiToolName,
  dumpUiToolDefinition,
  buildDumpUiHandler,
} from './presentation/tools/screenshotAndDumpTools.js';
import {
  inputTapToolName,
  inputTapToolDefinition,
  buildInputTapHandler,
  inputTextToolName,
  inputTextToolDefinition,
  buildInputTextHandler,
  inputKeyToolName,
  inputKeyToolDefinition,
  buildInputKeyHandler,
  inputSwipeToolName,
  inputSwipeToolDefinition,
  buildInputSwipeHandler,
  setInputVisualizationToolName,
  setInputVisualizationToolDefinition,
  buildSetInputVisualizationHandler,
} from './presentation/tools/inputTools.js';
import {
  tapTextToolName,
  tapTextToolDefinition,
  buildTapByTextHandler,
  tapResourceIdToolName,
  tapResourceIdToolDefinition,
  buildTapByResourceIdHandler,
  setTextToolName,
  setTextToolDefinition,
  buildSetTextHandler,
  waitForTextToolName,
  waitForTextToolDefinition,
  buildWaitForTextHandler,
  waitForResourceIdToolName,
  waitForResourceIdToolDefinition,
  buildWaitForResourceIdHandler,
  waitForIdleToolName,
  waitForIdleToolDefinition,
  buildWaitForIdleHandler,
} from './presentation/tools/locatorsAndWaitsTools.js';
import {
  launchAppToolName,
  launchAppToolDefinition,
  buildLaunchAppHandler,
  forceStopAppToolName,
  forceStopAppToolDefinition,
  buildForceStopAppHandler,
  clearAppDataToolName,
  clearAppDataToolDefinition,
  buildClearAppDataHandler,
  runInstrumentedTestsToolName,
  runInstrumentedTestsToolDefinition,
  buildRunInstrumentedTestsHandler,
  installApkToolName,
  installApkToolDefinition,
  buildInstallApkHandler,
} from './presentation/tools/lifecycleTools.js';
import {
  runMaestroFlowToolName,
  runMaestroFlowToolDefinition,
  buildRunMaestroFlowHandler,
  listMaestroFlowsToolName,
  listMaestroFlowsToolDefinition,
  buildListMaestroFlowsHandler,
  validateMaestroFlowToolName,
  validateMaestroFlowToolDefinition,
  buildValidateMaestroFlowHandler,
} from './presentation/tools/maestroTools.js';
import {
  batchToolName,
  batchToolDefinition,
  buildBatchToolHandler,
  type BatchToolEntry,
  type BatchSubHandler,
} from './presentation/tools/batchTool.js';

import { ABSOLUTE_LOGCAT_CAP_VALUE } from './config/Config.js';

/**
 * Composition root: builds every concrete dependency once and wires it into an
 * MCP server. Pure function — no side effects beyond constructing objects.
 */
export function createServer(config: Config, logger: Logger): McpServer {
  // --- Infrastructure ---
  const pathValidator = new PathValidator(config.androidProjectRoot);
  const outputsValidator = new PathValidator(config.outputsRoot);
  const adbRunner = new AdbProcessRunner(config.adbPath);
  const adb = new AdbAdapter(adbRunner);
  const appController = new AdbAppController(adbRunner, outputsValidator);
  const previewScanner = new ComposePreviewScanner(pathValidator);
  const projectScanner = new ProjectScanner(pathValidator);
  const networkInspector = new LogcatNetworkInspector(adb, config.httpLogFormat);
  const gradleRunner = new GradleProcessRunner();
  const junitParser = new JUnitXmlParser(pathValidator);
  const lintParser = new LintXmlParser(pathValidator);
  const buildSystem = new GradleAdapter(pathValidator, gradleRunner, junitParser, lintParser);
  const flowsValidator = new PathValidator(config.flowsRoot);
  const maestroRunner = new MaestroProcessRunner();
  const maestroAdapter = new MaestroAdapter(
    config.maestroBinPath,
    flowsValidator,
    config.allowFlowScripts,
    maestroRunner,
  );

  // --- Application ---
  const listDevices = new ListDevicesUseCase(adb);
  const getLogcat = new GetLogcatUseCase(
    adb,
    config.defaultDeviceSerial,
    config.logcatMaxLines,
    ABSOLUTE_LOGCAT_CAP_VALUE,
  );
  const listPreviews = new ListComposePreviewsUseCase(
    previewScanner,
    config.androidProjectRoot,
  );
  const getPreviewSource = new GetComposePreviewSourceUseCase(
    previewScanner,
    config.androidProjectRoot,
  );
  const getProjectStructure = new GetProjectStructureUseCase(
    projectScanner,
    config.androidProjectRoot,
  );
  const getPreviewsTree = new GetComposePreviewsTreeUseCase(
    previewScanner,
    projectScanner,
    config.androidProjectRoot,
  );
  const getNetworkCalls = new GetNetworkCallsUseCase(
    networkInspector,
    config.defaultDeviceSerial,
    config.defaultHttpLogTags,
  );
  const resizeLogcatBuffer = new ResizeLogcatBufferUseCase(
    adb,
    config.defaultDeviceSerial,
  );
  const runGradleTask = new RunGradleTaskUseCase(buildSystem);
  const getAppErrors = new GetAppErrorsUseCase(adb, config.defaultDeviceSerial);
  const inspectPackages = new InspectPackagesUseCase(adb, config.defaultDeviceSerial);
  const takeScreenshot = new TakeScreenshotUseCase(appController, config.defaultDeviceSerial);
  const dumpUi = new DumpUiUseCase(appController, config.defaultDeviceSerial);
  const inputTap = new InputTapUseCase(appController, config.defaultDeviceSerial);
  const inputText = new InputTextUseCase(appController, config.defaultDeviceSerial);
  const inputKey = new InputKeyUseCase(appController, config.defaultDeviceSerial);
  const inputSwipe = new InputSwipeUseCase(appController, config.defaultDeviceSerial);
  const setInputVisualization = new SetInputVisualizationUseCase(appController, config.defaultDeviceSerial);
  const tapByText = new TapByTextUseCase(appController, config.defaultDeviceSerial);
  const tapByResourceId = new TapByResourceIdUseCase(appController, config.defaultDeviceSerial);
  const setText = new SetTextUseCase(appController, config.defaultDeviceSerial);
  const waitForText = new WaitForTextUseCase(appController, config.defaultDeviceSerial);
  const waitForResourceId = new WaitForResourceIdUseCase(appController, config.defaultDeviceSerial);
  const waitForIdle = new WaitForIdleUseCase(appController, config.defaultDeviceSerial);
  const launchApp = new LaunchAppUseCase(appController, config.defaultDeviceSerial);
  const forceStopApp = new ForceStopAppUseCase(appController, config.defaultDeviceSerial);
  const clearAppData = new ClearAppDataUseCase(appController, config.defaultDeviceSerial);
  const runInstrumentedTests = new RunInstrumentedTestsUseCase(buildSystem);
  const installApk = new InstallApkUseCase(appController, config.defaultDeviceSerial, pathValidator);
  const runMaestroFlow = new RunMaestroFlowUseCase(maestroAdapter);
  const listMaestroFlows = new ListMaestroFlowsUseCase(maestroAdapter);
  const validateMaestroFlow = new ValidateMaestroFlowUseCase(maestroAdapter);

  // --- MCP server ---
  const server = new McpServer(
    {
      name: 'devilge',
      version: '0.2.1',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'devilge exposes Android-project insights to AI assistants. Use it to ' +
        'list connected devices, read logcat, enumerate Jetpack Compose @Preview functions, ' +
        'fetch their source, and describe the Gradle module layout.',
    },
  );

  // Registry shared with the batch tool. Populated as we register each tool
  // below, so devilge_batch can dispatch by name at runtime.
  const batchRegistry = new Map<string, BatchToolEntry>();

  // Wrapper that registers a tool with McpServer AND mirrors the entry into
  // the batch registry. The cast on `definition`/`handler` is intentional:
  // each tool has its own input shape, but at the registry level we need a
  // common erased type. Per-call validation happens inside the batch handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = (name: string, definition: any, handler: any): void => {
    server.registerTool(name, definition, handler);
    batchRegistry.set(name, {
      inputSchema: definition.inputSchema ?? {},
      handler: handler as BatchSubHandler,
    });
  };

  register(devicesToolName, devicesToolDefinition, buildDevicesToolHandler(listDevices));
  register(logcatToolName, logcatToolDefinition, buildLogcatToolHandler(getLogcat));
  register(listPreviewsToolName, listPreviewsToolDefinition, buildListPreviewsHandler(listPreviews));
  register(getPreviewSourceToolName, getPreviewSourceToolDefinition, buildGetPreviewSourceHandler(getPreviewSource));
  register(projectStructureToolName, projectStructureToolDefinition, buildProjectStructureHandler(getProjectStructure));
  register(previewsTreeToolName, previewsTreeToolDefinition, buildPreviewsTreeHandler(getPreviewsTree));
  register(networkCallsToolName, networkCallsToolDefinition, buildNetworkCallsHandler(getNetworkCalls));
  register(resizeLogcatBufferToolName, resizeLogcatBufferToolDefinition, buildResizeLogcatBufferHandler(resizeLogcatBuffer));
  register(runGradleTaskToolName, runGradleTaskToolDefinition, buildRunGradleTaskHandler(runGradleTask));
  register(appErrorsToolName, appErrorsToolDefinition, buildAppErrorsHandler(getAppErrors));
  register(inspectPackagesToolName, inspectPackagesToolDefinition, buildInspectPackagesHandler(inspectPackages));
  register(takeScreenshotToolName, takeScreenshotToolDefinition, buildTakeScreenshotHandler(takeScreenshot));
  register(dumpUiToolName, dumpUiToolDefinition, buildDumpUiHandler(dumpUi));
  register(inputTapToolName, inputTapToolDefinition, buildInputTapHandler(inputTap));
  register(inputTextToolName, inputTextToolDefinition, buildInputTextHandler(inputText));
  register(inputKeyToolName, inputKeyToolDefinition, buildInputKeyHandler(inputKey));
  register(inputSwipeToolName, inputSwipeToolDefinition, buildInputSwipeHandler(inputSwipe));
  register(setInputVisualizationToolName, setInputVisualizationToolDefinition, buildSetInputVisualizationHandler(setInputVisualization));
  register(tapTextToolName, tapTextToolDefinition, buildTapByTextHandler(tapByText));
  register(tapResourceIdToolName, tapResourceIdToolDefinition, buildTapByResourceIdHandler(tapByResourceId));
  register(setTextToolName, setTextToolDefinition, buildSetTextHandler(setText));
  register(waitForTextToolName, waitForTextToolDefinition, buildWaitForTextHandler(waitForText));
  register(waitForResourceIdToolName, waitForResourceIdToolDefinition, buildWaitForResourceIdHandler(waitForResourceId));
  register(waitForIdleToolName, waitForIdleToolDefinition, buildWaitForIdleHandler(waitForIdle));
  register(launchAppToolName, launchAppToolDefinition, buildLaunchAppHandler(launchApp));
  register(forceStopAppToolName, forceStopAppToolDefinition, buildForceStopAppHandler(forceStopApp));
  register(clearAppDataToolName, clearAppDataToolDefinition, buildClearAppDataHandler(clearAppData));
  register(runInstrumentedTestsToolName, runInstrumentedTestsToolDefinition, buildRunInstrumentedTestsHandler(runInstrumentedTests));
  register(installApkToolName, installApkToolDefinition, buildInstallApkHandler(installApk));
  register(runMaestroFlowToolName, runMaestroFlowToolDefinition, buildRunMaestroFlowHandler(runMaestroFlow));
  register(listMaestroFlowsToolName, listMaestroFlowsToolDefinition, buildListMaestroFlowsHandler(listMaestroFlows));
  register(validateMaestroFlowToolName, validateMaestroFlowToolDefinition, buildValidateMaestroFlowHandler(validateMaestroFlow));

  // The batch tool itself goes through `server.registerTool` directly and is
  // NOT mirrored into `batchRegistry`. The handler captures `batchRegistry`
  // by reference, so it sees every tool registered above when invoked, but
  // it cannot invoke itself (the recursion guard rejects it explicitly).
  //
  // The cast erases the structural mismatch between our internal ContentItem
  // type (loose to allow forwarding sub-tool content) and the SDK's strict
  // CallToolResult content union. In practice every sub-handler returns
  // either { type: 'text', text } or one of the SDK-recognized shapes, so the
  // batch output is always a valid concatenation.
  server.registerTool(
    batchToolName,
    batchToolDefinition,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildBatchToolHandler(batchRegistry) as any,
  );

  logger.info('devilge MCP server constructed', {
    androidProjectRoot: config.androidProjectRoot,
    outputsRoot: config.outputsRoot,
    tools: [
      devicesToolName,
      logcatToolName,
      listPreviewsToolName,
      getPreviewSourceToolName,
      previewsTreeToolName,
      projectStructureToolName,
      networkCallsToolName,
      resizeLogcatBufferToolName,
      runGradleTaskToolName,
      appErrorsToolName,
      inspectPackagesToolName,
      takeScreenshotToolName,
      dumpUiToolName,
      inputTapToolName,
      inputTextToolName,
      inputKeyToolName,
      inputSwipeToolName,
      setInputVisualizationToolName,
      tapTextToolName,
      tapResourceIdToolName,
      setTextToolName,
      waitForTextToolName,
      waitForResourceIdToolName,
      waitForIdleToolName,
      launchAppToolName,
      forceStopAppToolName,
      clearAppDataToolName,
      runInstrumentedTestsToolName,
      installApkToolName,
      runMaestroFlowToolName,
      listMaestroFlowsToolName,
      validateMaestroFlowToolName,
      batchToolName,
    ],
  });

  return server;
}
