/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const path = require('path');

function createWrapperScript() {
  return `#!/usr/bin/env python3
"""
Open WebUI Launcher - Compiled with Nuitka
This wrapper is compiled to native code and launches Open WebUI.
"""
import sys
import os

# Ensure the package can find its resources
if getattr(sys, 'frozen', False):
    # Running as compiled
    bundle_dir = os.path.dirname(sys.executable)
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

# Add to path
sys.path.insert(0, bundle_dir)

def main():
    from open_webui.main import app
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser(description='Open WebUI Server')
    parser.add_argument('--port', type=int, default=8080, help='Port to run on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to')
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)

if __name__ == '__main__':
    main()
`;
}

function createNuitkaArgs({ platformInfo, outputDir, entryPoint, wrapperPath, cpuJobs }) {
  return [
    '-m', 'nuitka',
    '--standalone',
    `--output-dir=${outputDir}`,
    `--output-filename=open-webui${platformInfo.exeExt}`,
    '--lto=no',
    `--jobs=${cpuJobs}`,
    '--static-libpython=no',
    '--include-package=open_webui',
    '--include-package=uvicorn',
    '--include-package=fastapi',
    '--include-package=starlette',
    '--include-package=pydantic',
    '--include-package=pydantic_core',
    '--include-package=pydantic_settings',
    '--include-package=sqlalchemy',
    '--include-package=chromadb',
    '--include-package=sentence_transformers',
    '--include-package=langchain',
    '--include-package=langchain_core',
    '--include-package=langchain_classic',
    '--include-package=langchain_community',
    '--include-package=langchain_text_splitters',
    '--include-package=langsmith',
    '--include-package=langgraph',
    '--include-package=langgraph_sdk',
    '--include-package=transformers',
    '--include-package=torch',
    '--include-package=numpy',
    '--include-package=httpx',
    '--include-package=websockets',
    '--include-package=tiktoken',
    '--include-package=bs4',
    '--include-package=pypdf',
    '--include-package=openai',
    '--include-package=anthropic',
    '--include-package=aiohttp',
    '--include-package=aiofiles',
    '--include-package=alembic',
    '--include-package=peewee_migrate',
    '--include-package=unstructured',
    '--include-package=unittest',
    '--include-package=unittest.mock',
    `--include-data-dir=${entryPoint}/static=open_webui/static`,
    `--include-data-files=${entryPoint}/migrations/*.py=open_webui/migrations/`,
    `--include-data-files=${entryPoint}/migrations/*.mako=open_webui/migrations/`,
    `--include-data-files=${entryPoint}/migrations/README=open_webui/migrations/`,
    `--include-data-files=${entryPoint}/migrations/versions/*.py=open_webui/migrations/versions/`,
    `--include-data-files=${entryPoint}/internal/migrations/*.py=open_webui/internal/migrations/`,
    `--include-data-dir=${entryPoint}/frontend=open_webui/frontend`,
    `--include-data-files=${path.join(entryPoint, 'CHANGELOG.md')}=open_webui/CHANGELOG.md`,
    `--include-data-files=${path.join(entryPoint, 'alembic.ini')}=open_webui/alembic.ini`,
    '--noinclude-custom-mode=transformers:bytecode',
    '--noinclude-custom-mode=huggingface_hub:bytecode',
    '--noinclude-custom-mode=sentence_transformers:bytecode',
    '--nofollow-import-to=torch._dynamo',
    '--nofollow-import-to=torch._dynamo.*',
    '--nofollow-import-to=torch._functorch',
    '--nofollow-import-to=torch._functorch.*',
    '--nofollow-import-to=torch.compiler',
    '--nofollow-import-to=torch.compiler.*',
    '--nofollow-import-to=torch._inductor',
    '--nofollow-import-to=torch._inductor.*',
    '--nofollow-import-to=torch.distributed',
    '--nofollow-import-to=torch.distributed.*',
    '--nofollow-import-to=torch.testing',
    '--nofollow-import-to=torch.testing.*',
    '--nofollow-import-to=torch.utils.benchmark',
    '--nofollow-import-to=torch.utils.benchmark.*',
    '--nofollow-import-to=transformers.commands',
    '--nofollow-import-to=transformers.commands.*',
    '--nofollow-import-to=*.tests',
    '--nofollow-import-to=*.tests.*',
    '--nofollow-import-to=*._tests',
    '--nofollow-import-to=*._tests.*',
    '--nofollow-import-to=*.testing',
    '--nofollow-import-to=*.testing.*',
    '--nofollow-import-to=*.conftest',
    '--nofollow-import-to=pytest',
    '--nofollow-import-to=pytest.*',
    '--nofollow-import-to=doctest',
    '--nofollow-import-to=setuptools',
    '--nofollow-import-to=setuptools.*',
    '--assume-yes-for-downloads',
    wrapperPath
  ];
}

function createDataChecks(entryPoint) {
  return [
    { dir: path.join(entryPoint, 'static'), match: 'static=open_webui/static' },
    { dir: path.join(entryPoint, 'migrations'), match: '=open_webui/migrations/' },
    { dir: path.join(entryPoint, 'internal', 'migrations'), match: '=open_webui/internal/migrations/' },
    { dir: path.join(entryPoint, 'frontend'), match: 'frontend=open_webui/frontend' },
    { dir: path.join(entryPoint, 'alembic.ini'), match: 'alembic.ini' }
  ];
}

module.exports = {
  createWrapperScript,
  createNuitkaArgs,
  createDataChecks
};
