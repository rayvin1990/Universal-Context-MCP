/**
 * Project Resolver - 项目解析模块
 * 加载项目结构、依赖、配置
 */

import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, extname, dirname } from 'path';

export const FileType = {
  SOURCE: 'source',       // 源代码
  CONFIG: 'config',       // 配置文件
  TEST: 'test',           // 测试文件
  DOCUMENT: 'document',  // 文档
  ASSET: 'asset',        // 资源文件
  OTHER: 'other'
};

// 配置文件识别
const CONFIG_FILES = [
  'package.json', 'tsconfig.json', 'jsconfig.json',
  '.npmrc', '.nvmrc', '.node-version',
  'pyproject.toml', 'requirements.txt', 'Pipfile',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
  '.gitignore', '.env.example', 'docker-compose.yml',
  'next.config.js', 'vite.config.ts', 'webpack.config.js'
];

// 忽略目录
const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', '__pycache__',
  'vendor', 'target', '.svn', '.hg'
];

// 源码扩展名
const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs',
  '.cpp', '.c', '.h', '.hpp', '.vue', '.svelte'
]);

export class ProjectResolver {
  constructor(options = {}) {
    this.options = {
      maxDepth: 5,
      maxFiles: 1000,
      ignorePatterns: ['**/node_modules/**', '**/.git/**'],
      ...options
    };
    this.cache = new Map();
  }

  /**
   * 解析项目结构
   * @param {string} projectPath - 项目根目录
   * @returns {Promise<ProjectInfo>}
   */
  async resolve(projectPath) {
    const cacheKey = projectPath;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const projectInfo = {
      root: projectPath,
      name: this.getProjectName(projectPath),
      structure: await this.buildStructure(projectPath),
      dependencies: await this.getDependencies(projectPath),
      config: await this.getConfig(projectPath),
      language: this.detectLanguage(projectPath),
      framework: this.detectFramework(projectPath)
    };

    this.cache.set(cacheKey, projectInfo);
    return projectInfo;
  }

  /**
   * 获取项目名
   */
  getProjectName(projectPath) {
    const packageJson = join(projectPath, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        return pkg.name || projectPath.split(/[/\\]/).pop();
      } catch {
        return projectPath.split(/[/\\]/).pop();
      }
    }
    return projectPath.split(/[/\\]/).pop();
  }

  /**
   * 构建项目结构树
   */
  async buildStructure(projectPath) {
    const structure = {
      files: [],
      dirs: new Set()
    };

    await this.scanDirectory(projectPath, structure, 0);

    return {
      files: structure.files.slice(0, this.options.maxFiles),
      dirCount: structure.dirs.size
    };
  }

  /**
   * 递归扫描目录
   */
  async scanDirectory(dirPath, structure, depth) {
    if (depth > this.options.maxDepth) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = relative(this.options.root || dirPath, fullPath);

        // 忽略检查
        if (this.shouldIgnore(relativePath, entry.isDirectory())) {
          continue;
        }

        if (entry.isDirectory()) {
          structure.dirs.add(relativePath);
          await this.scanDirectory(fullPath, structure, depth + 1);
        } else {
          const fileInfo = this.getFileInfo(fullPath);
          if (fileInfo) {
            structure.files.push(fileInfo);
          }
        }
      }
    } catch (err) {
      // 权限错误，跳过
    }
  }

  /**
   * 判断是否忽略
   */
  shouldIgnore(path, isDir) {
    const name = path.split(/[/\\]/)[0];

    if (isDir && IGNORE_DIRS.includes(name)) {
      return true;
    }

    for (const pattern of this.options.ignorePatterns) {
      if (minimatch(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取文件信息
   */
  getFileInfo(filePath) {
    try {
      const stat = statSync(filePath);
      const ext = extname(filePath);
      const name = filePath.split(/[/\\]/).pop();

      return {
        path: filePath,
        name,
        ext: ext.toLowerCase(),
        type: this.getFileType(ext, name),
        size: stat.size,
        modified: stat.mtime
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取文件类型
   */
  getFileType(ext, name) {
    if (CONFIG_FILES.includes(name)) {
      return FileType.CONFIG;
    }
    if (ext === '.test.js' || ext.includes('test') || name.includes('.spec.')) {
      return FileType.TEST;
    }
    if (['.md', '.txt', '.rst'].includes(ext)) {
      return FileType.DOCUMENT;
    }
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(ext)) {
      return FileType.ASSET;
    }
    if (SOURCE_EXTENSIONS.has(ext)) {
      return FileType.SOURCE;
    }
    return FileType.OTHER;
  }

  /**
   * 获取依赖信息
   */
  async getDependencies(projectPath) {
    const packageJson = join(projectPath, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        return {
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {},
          peerDependencies: pkg.peerDependencies || {}
        };
      } catch {
        return { dependencies: {}, devDependencies: {}, peerDependencies: {} };
      }
    }

    // 其他语言项目
    return this.getLanguageDeps(projectPath);
  }

  /**
   * 获取语言特定依赖
   */
  getLanguageDeps(projectPath) {
    const deps = {};

    // Python
    if (existsSync(join(projectPath, 'requirements.txt'))) {
      deps.python = 'pip';
    }
    if (existsSync(join(projectPath, 'pyproject.toml'))) {
      deps.python = 'poetry';
    }

    // Go
    if (existsSync(join(projectPath, 'go.mod'))) {
      deps.go = 'module';
    }

    // Rust
    if (existsSync(join(projectPath, 'Cargo.toml'))) {
      deps.rust = 'cargo';
    }

    return deps;
  }

  /**
   * 获取项目配置
   */
  async getConfig(projectPath) {
    const config = {};

    for (const configFile of CONFIG_FILES) {
      const configPath = join(projectPath, configFile);
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          if (configFile.endsWith('.json')) {
            config[configFile] = JSON.parse(content);
          } else {
            config[configFile] = content;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return config;
  }

  /**
   * 检测编程语言
   */
  detectLanguage(projectPath) {
    const languages = {
      JavaScript: ['.js', '.mjs', '.cjs'],
      TypeScript: ['.ts', '.tsx'],
      Python: ['.py'],
      Go: ['.go'],
      Rust: ['.rs'],
      Java: ['.java'],
      CSharp: ['.cs'],
      Cpp: ['.cpp', '.cc', '.cxx']
    };

    const counts = {};

    for (const [lang, exts] of Object.entries(languages)) {
      counts[lang] = 0;
      for (const ext of exts) {
        const files = glob.sync(join(projectPath, `**/*${ext}`), {
          ignore: [...IGNORE_DIRS.map(d => `**/${d}/**`)]
        });
        counts[lang] += files.length;
      }
    }

    let maxCount = 0;
    let detected = 'Unknown';

    for (const [lang, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        detected = lang;
      }
    }

    return detected;
  }

  /**
   * 检测框架
   */
  detectFramework(projectPath) {
    const frameworks = {
      'Next.js': ['next.config.js', 'next.config.mjs'],
      'Vite': ['vite.config.js', 'vite.config.ts'],
      'Webpack': ['webpack.config.js'],
      'React': ['package.json'],
      'Vue': ['vue.config.js'],
      'Express': ['package.json'],
      'NestJS': ['package.json']
    };

    const packageJson = join(projectPath, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) return 'Next.js';
        if (deps.react) return 'React';
        if (deps.vue) return 'Vue';
        if (deps.express) return 'Express';
        if (deps.nest) return 'NestJS';
        if (deps.vite) return 'Vite';
      } catch {
        // ignore
      }
    }

    return 'Unknown';
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

export default ProjectResolver;
