import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

export interface RouteRecord { feature: string; path: string; title: string }
export function readFeatureRoutes(root: string): RouteRecord[] {
  const routes: RouteRecord[] = [];
  for (const feature of readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    const file = join(root, feature, 'index.tsx');
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'routes' && ts.isArrayLiteralExpression(node.initializer)) {
        for (const entry of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(entry)) throw new Error(`Route metadata must be literal: ${file}`);
          const properties = new Map(entry.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(ast).replaceAll(/['"]/g, ''), property.initializer]));
          const path = properties.get('path'), title = properties.get('title');
          if (!path || !title || !ts.isStringLiteral(path) || !ts.isStringLiteral(title)) throw new Error(`Route path/title must be literal: ${file}`);
          if (routes.some(route => route.path === path.text)) throw new Error(`Duplicate route: ${path.text}`);
          routes.push({ feature, path: path.text, title: title.text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return routes;
}
export function featureRouteManifest(root: string): Plugin {
  const name = 'virtual:lingjing-feature-routes', resolved = `\0${name}`;
  return {
    name: 'lingjing-feature-route-manifest',
    resolveId(id) { if (id === name) return resolved; },
    load(id) { if (id === resolved) return `export default ${JSON.stringify(readFeatureRoutes(root))};`; },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'feature-routes.json', source: JSON.stringify(readFeatureRoutes(root), null, 2) }); },
    handleHotUpdate(context) {
      if (!context.file.endsWith('/index.tsx') && !context.file.endsWith('\\index.tsx')) return;
      const module = context.server.moduleGraph.getModuleById(resolved);
      if (module) context.server.moduleGraph.invalidateModule(module);
    }
  };
}
