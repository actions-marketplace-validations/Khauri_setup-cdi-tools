import * as core from '@actions/core';
import path from 'path'
import yaml from 'js-yaml';

import toolsYaml from './tools.yml';
import {getBinary, getTarballBinary} from './utils';

export const tools = yaml.load(toolsYaml) as Record<string, ToolConfig>;

export type PlatformConfig = {
  version?: string,
  /**
   * Usually the file extension of the downloaded tool will be used to determine if the tool is a binary or an archive.
   * Use this option if the file extension is not enough to determine the type of the downloaded tool.
   * When set to true the installer will extract the download as an archive using a default strategy.
   * When set to 'zip' or 'tar' the installer will extract the downloaded archive using the specified method.
   * When set to false the installer will assume a binary was downloaded and will not attempt unarchiving.
   */
  unArchive?: boolean|'zip'|'tar',
  /**
   * Indicates the relative path to the binary if the tool is within an archive.
   * If not provided the installer will look for a file with the same name as the tool at the root of the repository.
   * Provide this option if the binary is located in a subdirectory, has a different name, or there are multiple binaries in the archive.
   */
  binaryPath?: string,
  /**
   * A list of architectures supported by the tool
   */
  architectures?: {
    x64?: boolean|PlatformConfig&{as?: string}, 
    arm64?: boolean|PlatformConfig&{as?: string},
  },

  /**
   * The template used to generate the download URL
   */
  template?: string,

  /**
   * The file extension of the downloaded tool. Usually .exe for Windows binaries and empty for linux, but this can be overriden here
   */
  extension?: string,

  /**
   * Custom headers to include in the download request.
   */
  headers?: Record<string, string>,

  /**
   * A shortcut for setting the Authorization header.
   * If provided, the value is passed as the `auth` parameter to `@actions/tool-cache` downloadTool,
   * which sets the Authorization header to `token ${token}`. This format is compatible with GitHub's API.
   */
  token?: string,
}

export type ToolConfig = PlatformConfig & {
  platforms?: {
    // Operating system specific settings
    linux?: PlatformConfig & {as?: string},
    darwin?: PlatformConfig & {as?: string},
    windows?: PlatformConfig & {as?: string},
  }
};

const platformMap = {
  linux: 'linux',
  darwin: 'darwin',
  win32: 'windows',
  windows: 'windows',
} as const;

const archMap = {
  x64: 'x64',
  amd64: 'x64',
  arm64: 'arm64',
} as const;

function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\${([^}]+)}/g, (_, key) => {
    return variables[key] || '';
  });
}

export function resolveConfig(config: String|ToolConfig): [PlatformConfig, Record<string, string>] {
  const variables = {
    platform: core.platform.platform as string,
    arch: core.platform.arch,
  };
  if(typeof config === 'string') {
    config = {template: config};
  }

  // Override the config with platform+arch specific settings
  const settings: ToolConfig = {...config as ToolConfig};
  
  const platform = platformMap[core.platform.platform as keyof typeof platformMap];
  // check if config has platform specific settings
  const platformConfig = settings.platforms?.[platform];
  if(platformConfig) {
    Object.assign(settings, settings.platforms?.[platform]);
    if(platformConfig.as) {
      variables.platform = platformConfig.as;
    }
  }
  delete settings.platforms;
  // Check if architecture is supported
  const arch = archMap[core.platform.arch as keyof typeof archMap];
  if(typeof settings.architectures === 'undefined') {
    // If no architectures are defined, assume all architectures are under the same configuration
    return [settings, variables];
  }
  const archConfig = settings.architectures[arch];
  if(!archConfig) {
    // Unless explicitly defined, architecture is not supported for this tool
    throw new Error(`Unsupported platform and architecture: ${platform}_${arch}`);
  }
  Object.assign(settings, archConfig);
  if(typeof archConfig === 'object' && archConfig.as) {
    variables.arch = archConfig.as;
  }
  delete settings.architectures;
  return [settings, variables];
}

export function install(toolName: string, toolConfig: PlatformConfig) {
  return core.group(`Install ${toolName}`, async () => {
    const [config, platformVariables] = resolveConfig({
      ...tools[toolName] as ToolConfig,
      ...toolConfig,
    });
    const variables = {
      ...platformVariables,
      version: config.version!,
      extension: config.extension!,
    };
    const url = resolveTemplate(config.template!, variables);
    const unArchive = config.unArchive ?? url.match(/(\.zip$|\.tar\.gz$|\.tgz$)/)?.[1] ?? false;
    let {binaryPath} = config;
    if(binaryPath) {
      binaryPath = resolveTemplate(binaryPath, variables);
    }
    const auth = config.token ? `token ${config.token}` : undefined;
    const headers = config.headers;
    // console.log({binaryPath, url, config});
    const toolPath = unArchive 
      ? await getTarballBinary(toolName, config.version!, url, binaryPath, auth, headers)
      : await getBinary(toolName, config.version!, url, auth, headers);
    // TODO: switch from binaryPath to toolPath in this log
    core.debug(`${toolName} has been cached at ${toolPath}`);
    core.addPath(path.dirname(toolPath));
    return toolPath;
  });
}

async function run() {
  // Install built-in tools
  for(const [tool, config] of Object.entries(tools as Record<string, String|ToolConfig>)) {
    const version = core.getInput(tool);
    if(version) {
      const toolConfig = typeof config === 'string' 
        ? {version, template: config} 
        : {...config, version};
      await install(tool, toolConfig);
    }
  }
  // Install custom tools
  const customTools = core.getInput('custom');
  if(customTools) {
    const parsed = yaml.load(customTools) as Record<string, String|ToolConfig>;
    for(const [tool, config] of Object.entries(parsed)) {
      const toolConfig = typeof config === 'string'
        ? {template: config}
        : config as ToolConfig;
      await install(tool, toolConfig);
    }
  }
}

// Maybe replace with import.meta.main in the future
if(!process.env.IS_TEST) {
  run().catch(core.setFailed);
}
