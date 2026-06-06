export type ProjectFileKind = 'gitignore' | 'license' | 'readme' | 'env';

export type ProjectFile = {
  id: string;
  path: string;
  kind: ProjectFileKind;
  mime: string;
  content: string;
  enabled: boolean;
  updatedAt: string;
};

export type ProjectFileTemplateId =
  | 'gitignore-vite-react'
  | 'license-mit'
  | 'license-bsd-3-clause'
  | 'license-apache-2'
  | 'readme-basic'
  | 'env-example';

export type ProjectGitignoreSnippetId =
  | 'dependencies'
  | 'buildOutput'
  | 'localEnv'
  | 'logs'
  | 'editor'
  | 'testCache';

export type ProjectFileTemplate = {
  id: ProjectFileTemplateId;
  targetPath: string;
  label: string;
  content: string;
};

export type ProjectGitignoreSnippet = {
  id: ProjectGitignoreSnippetId;
  label: string;
  content: string;
};

export type ProjectFileTemplateContext = {
  projectName?: string;
  projectDescription?: string;
  copyrightHolder?: string;
  year?: number;
};

const nowIso = () => new Date().toISOString();

export const PROJECT_GITIGNORE_SNIPPETS: ProjectGitignoreSnippet[] = [
  {
    id: 'dependencies',
    label: 'Dependencies',
    content: `# dependencies
node_modules
`,
  },
  {
    id: 'buildOutput',
    label: 'Build output',
    content: `# production
dist
build
`,
  },
  {
    id: 'localEnv',
    label: 'Local env',
    content: `# local env
.env
.env.*
!.env.example
`,
  },
  {
    id: 'logs',
    label: 'Logs',
    content: `# logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
`,
  },
  {
    id: 'editor',
    label: 'Editor settings',
    content: `# editor
.DS_Store
.idea
.vscode
`,
  },
  {
    id: 'testCache',
    label: 'Test and cache',
    content: `# test and cache
coverage
.turbo
.vite
`,
  },
];

const defaultGitignoreContent = PROJECT_GITIGNORE_SNIPPETS.map((snippet) =>
  snippet.content.trimEnd()
).join('\n\n');

const createReadmeTemplateContent = (
  projectName: string,
  projectDescription: string
) => `# ${projectName}

${projectDescription}

## Overview

This project was exported from Prodivix as a standalone Vite + React application.

## Tech stack

- React
- TypeScript
- Vite

## Getting started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Available scripts

\`\`\`bash
npm install
npm run dev
npm run build
npm run preview
\`\`\`

## Project structure

\`\`\`text
src/
  App.tsx
  main.tsx
index.html
package.json
\`\`\`

## Notes

- Update this README before publishing or handing off the exported project.
- Keep environment-specific values in .env files and commit only safe examples.
`;

export const PROJECT_FILE_TEMPLATES: ProjectFileTemplate[] = [
  {
    id: 'gitignore-vite-react',
    targetPath: '.gitignore',
    label: 'Vite + React',
    content: `${defaultGitignoreContent}\n`,
  },
  {
    id: 'license-mit',
    targetPath: 'LICENSE',
    label: 'MIT',
    content: `MIT License

Copyright (c) [year] [copyright holder]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  },
  {
    id: 'license-bsd-3-clause',
    targetPath: 'LICENSE',
    label: 'BSD-3-Clause',
    content: `BSD 3-Clause License

Copyright (c) [year], [copyright holder]

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`,
  },
  {
    id: 'license-apache-2',
    targetPath: 'LICENSE',
    label: 'Apache-2.0',
    content: `Apache License
Version 2.0, January 2004
https://www.apache.org/licenses/

Copyright [year] [copyright holder]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`,
  },
  {
    id: 'readme-basic',
    targetPath: 'README.md',
    label: 'Basic README',
    content: createReadmeTemplateContent(
      '[project name]',
      '[Describe what this exported project does.]'
    ),
  },
  {
    id: 'env-example',
    targetPath: '.env.example',
    label: 'Environment example',
    content: `# Replace with your API base URL.
VITE_API_BASE_URL=https://api.example.com
`,
  },
];

export const createProjectFileTemplateContent = (
  template: ProjectFileTemplate,
  context: ProjectFileTemplateContext = {}
) => {
  const projectName = context.projectName?.trim() || '[project name]';
  const projectDescription =
    context.projectDescription?.trim() ||
    '[Describe what this exported project does.]';
  const copyrightHolder =
    context.copyrightHolder?.trim() || '[copyright holder]';
  const year = String(context.year ?? new Date().getFullYear());

  if (template.id === 'readme-basic') {
    return createReadmeTemplateContent(projectName, projectDescription);
  }

  if (
    template.id === 'license-mit' ||
    template.id === 'license-bsd-3-clause' ||
    template.id === 'license-apache-2'
  ) {
    return template.content
      .replaceAll('[year]', year)
      .replaceAll('[copyright holder]', copyrightHolder);
  }

  return template.content;
};

const createProjectFile = (
  path: string,
  kind: ProjectFileKind,
  mime: string,
  content: string,
  enabled: boolean
): ProjectFile => ({
  id: `project-file-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
  path,
  kind,
  mime,
  content,
  enabled,
  updatedAt: nowIso(),
});

const getFirstProjectFileTemplateByPath = (path: string) =>
  PROJECT_FILE_TEMPLATES.find((template) => template.targetPath === path);

export const createDefaultProjectFiles = (): ProjectFile[] => [
  (() => {
    const template = getFirstProjectFileTemplateByPath('.gitignore');
    return createProjectFile(
      '.gitignore',
      'gitignore',
      'text/plain',
      template?.content ?? '',
      true
    );
  })(),
  (() => {
    const template = getFirstProjectFileTemplateByPath('LICENSE');
    return createProjectFile(
      'LICENSE',
      'license',
      'text/plain',
      template ? createProjectFileTemplateContent(template) : '',
      false
    );
  })(),
  (() => {
    const template = getFirstProjectFileTemplateByPath('README.md');
    return createProjectFile(
      'README.md',
      'readme',
      'text/markdown',
      template ? createProjectFileTemplateContent(template) : '',
      false
    );
  })(),
  (() => {
    const template = getFirstProjectFileTemplateByPath('.env.example');
    return createProjectFile(
      '.env.example',
      'env',
      'text/plain',
      template?.content ?? '',
      false
    );
  })(),
];

const getProjectFilesStorageKey = (projectId?: string) =>
  `prodivix.projectFiles.${projectId?.trim() || 'default'}`;

const withDefaultProjectFiles = (files: ProjectFile[]) => {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const defaults = createDefaultProjectFiles();
  defaults.forEach((file) => {
    if (!filesByPath.has(file.path)) filesByPath.set(file.path, file);
  });
  return Array.from(filesByPath.values()).map((file) => ({
    ...file,
    updatedAt: file.updatedAt || nowIso(),
  }));
};

export const readProjectFiles = (projectId?: string): ProjectFile[] => {
  if (typeof window === 'undefined') return createDefaultProjectFiles();
  try {
    const raw = window.localStorage.getItem(
      getProjectFilesStorageKey(projectId)
    );
    if (!raw) return createDefaultProjectFiles();
    const parsed = JSON.parse(raw) as ProjectFile[];
    if (!Array.isArray(parsed)) return createDefaultProjectFiles();
    const validFiles = parsed.filter(
      (file): file is ProjectFile =>
        Boolean(file) &&
        typeof file.path === 'string' &&
        typeof file.content === 'string' &&
        typeof file.enabled === 'boolean'
    );
    return withDefaultProjectFiles(validFiles);
  } catch {
    return createDefaultProjectFiles();
  }
};

export const writeProjectFiles = (
  projectId: string | undefined,
  files: ProjectFile[]
) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    getProjectFilesStorageKey(projectId),
    JSON.stringify(withDefaultProjectFiles(files))
  );
};

export const updateProjectFile = (
  files: ProjectFile[],
  path: string,
  patch: Partial<Pick<ProjectFile, 'content' | 'enabled'>>
): ProjectFile[] =>
  withDefaultProjectFiles(files).map((file) =>
    file.path === path
      ? {
          ...file,
          ...patch,
          updatedAt: nowIso(),
        }
      : file
  );

export const applyProjectFileTemplate = (
  files: ProjectFile[],
  templateId: ProjectFileTemplateId
): ProjectFile[] => {
  const template = PROJECT_FILE_TEMPLATES.find(
    (item) => item.id === templateId
  );
  if (!template) return withDefaultProjectFiles(files);
  return updateProjectFile(files, template.targetPath, {
    content: createProjectFileTemplateContent(template),
    enabled: true,
  });
};

export const flattenEnabledProjectFiles = (
  files: ProjectFile[]
): Array<ProjectFile & { path: string }> =>
  withDefaultProjectFiles(files).filter((file) => file.enabled);
