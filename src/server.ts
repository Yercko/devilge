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
      version: '0.1.0',
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

  server.registerTool(
    devicesToolName,
    devicesToolDefinition,
    buildDevicesToolHandler(listDevices),
  );

  server.registerTool(
    logcatToolName,
    logcatToolDefinition,
    buildLogcatToolHandler(getLogcat),
  );

  server.registerTool(
    listPreviewsToolName,
    listPreviewsToolDefinition,
    buildListPreviewsHandler(listPreviews),
  );

  server.registerTool(
    getPreviewSourceToolName,
    getPreviewSourceToolDefinition,
    buildGetPreviewSourceHandler(getPreviewSource),
  );

  server.registerTool(
    projectStructureToolName,
    projectStructureToolDefinition,
    buildProjectStructureHandler(getProjectStructure),
  );

  server.registerTool(
    previewsTreeToolName,
    previewsTreeToolDefinition,
    buildPreviewsTreeHandler(getPreviewsTree),
  );

  server.registerTool(
    networkCallsToolName,
    networkCallsToolDefinition,
    buildNetworkCallsHandler(getNetworkCalls),
  );

  server.registerTool(
    resizeLogcatBufferToolName,
    resizeLogcatBufferToolDefinition,
    buildResizeLogcatBufferHandler(resizeLogcatBuffer),
  );

  server.registerTool(
    runGradleTaskToolName,
    runGradleTaskToolDefinition,
    buildRunGradleTaskHandler(runGradleTask),
  );

  server.registerTool(
    appErrorsToolName,
    appErrorsToolDefinition,
    buildAppErrorsHandler(getAppErrors),
  );

  server.registerTool(
    inspectPackagesToolName,
    inspectPackagesToolDefinition,
    buildInspectPackagesHandler(inspectPackages),
  );

  server.registerTool(takeScreenshotToolName, takeScreenshotToolDefinition, buildTakeScreenshotHandler(takeScreenshot));
  server.registerTool(dumpUiToolName, dumpUiToolDefinition, buildDumpUiHandler(dumpUi));
  server.registerTool(inputTapToolName, inputTapToolDefinition, buildInputTapHandler(inputTap));
  server.registerTool(inputTextToolName, inputTextToolDefinition, buildInputTextHandler(inputText));
  server.registerTool(inputKeyToolName, inputKeyToolDefinition, buildInputKeyHandler(inputKey));
  server.registerTool(inputSwipeToolName, inputSwipeToolDefinition, buildInputSwipeHandler(inputSwipe));
  server.registerTool(setInputVisualizationToolName, setInputVisualizationToolDefinition, buildSetInputVisualizationHandler(setInputVisualization));
  server.registerTool(tapTextToolName, tapTextToolDefinition, buildTapByTextHandler(tapByText));
  server.registerTool(tapResourceIdToolName, tapResourceIdToolDefinition, buildTapByResourceIdHandler(tapByResourceId));
  server.registerTool(setTextToolName, setTextToolDefinition, buildSetTextHandler(setText));
  server.registerTool(waitForTextToolName, waitForTextToolDefinition, buildWaitForTextHandler(waitForText));
  server.registerTool(waitForResourceIdToolName, waitForResourceIdToolDefinition, buildWaitForResourceIdHandler(waitForResourceId));
  server.registerTool(waitForIdleToolName, waitForIdleToolDefinition, buildWaitForIdleHandler(waitForIdle));
  server.registerTool(launchAppToolName, launchAppToolDefinition, buildLaunchAppHandler(launchApp));
  server.registerTool(forceStopAppToolName, forceStopAppToolDefinition, buildForceStopAppHandler(forceStopApp));
  server.registerTool(clearAppDataToolName, clearAppDataToolDefinition, buildClearAppDataHandler(clearAppData));
  server.registerTool(runInstrumentedTestsToolName, runInstrumentedTestsToolDefinition, buildRunInstrumentedTestsHandler(runInstrumentedTests));
  server.registerTool(installApkToolName, installApkToolDefinition, buildInstallApkHandler(installApk));
  server.registerTool(runMaestroFlowToolName, runMaestroFlowToolDefinition, buildRunMaestroFlowHandler(runMaestroFlow));
  server.registerTool(listMaestroFlowsToolName, listMaestroFlowsToolDefinition, buildListMaestroFlowsHandler(listMaestroFlows));
  server.registerTool(validateMaestroFlowToolName, validateMaestroFlowToolDefinition, buildValidateMaestroFlowHandler(validateMaestroFlow));

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
    ],
  });

  return server;
}
