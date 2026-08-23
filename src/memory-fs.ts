type FileNode = { kind: "file"; data: Uint8Array };
type DirNode = { kind: "dir"; children: Map<string, string> };
type Node = FileNode | DirNode;

function join(dir: string, name: string) {
  if (dir === "/" || dir === "") return `/${name}`.replace(/\/+/g, "/");
  return `${dir.replace(/\/$/, "")}/${name}`;
}

function parentOf(path: string) {
  const trimmed = path.replace(/\/+$/, "") || "/";
  const i = trimmed.lastIndexOf("/");
  return i <= 0 ? "/" : trimmed.slice(0, i);
}

function baseOf(path: string) {
  const trimmed = path.replace(/\/+$/, "") || "/";
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

function toBytes(data: string | Uint8Array) {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

export function createMemoryFs() {
  const nodes = new Map<string, Node>([["/" , { kind: "dir", children: new Map() }]]);

  function get(path: string) {
    const key = path === "" ? "/" : path.replace(/\/+$/, "") || "/";
    return nodes.get(key);
  }

  function statLike(path: string) {
    const node = get(path);
    if (!node) {
      const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
      err.code = "ENOENT";
      throw err;
    }
    const isFile = node.kind === "file";
    return {
      type: isFile ? "file" : "dir",
      mode: isFile ? 0o100644 : 0o040755,
      size: isFile ? node.data.byteLength : 0,
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      uid: 0,
      gid: 0,
      dev: 1,
      ino: 1,
      isFile: () => isFile,
      isDirectory: () => !isFile,
      isSymbolicLink: () => false,
    };
  }

  return {
    promises: {
      async mkdir(path: string, opts?: { recursive?: boolean }) {
        const key = path.replace(/\/+$/, "") || "/";
        if (get(key)?.kind === "dir") return;
        if (get(key)?.kind === "file") {
          const err = new Error(`EEXIST: ${path}`) as Error & { code: string };
          err.code = "EEXIST";
          throw err;
        }
        const parent = parentOf(key);
        if (!get(parent)) {
          if (!opts?.recursive) {
            const err = new Error(`ENOENT: ${parent}`) as Error & { code: string };
            err.code = "ENOENT";
            throw err;
          }
          await this.mkdir(parent, { recursive: true });
        }
        nodes.set(key, { kind: "dir", children: new Map() });
        const parentNode = get(parent);
        if (parentNode?.kind === "dir") parentNode.children.set(baseOf(key), key);
      },
      async writeFile(path: string, data: string | Uint8Array) {
        const key = path.replace(/\/+$/, "") || "/";
        const parent = parentOf(key);
        if (!get(parent)) await this.mkdir(parent, { recursive: true });
        nodes.set(key, { kind: "file", data: toBytes(data) });
        const parentNode = get(parent);
        if (parentNode?.kind === "dir") parentNode.children.set(baseOf(key), key);
      },
      async readFile(path: string, encoding?: string | { encoding?: string }) {
        const node = get(path);
        if (node?.kind !== "file") {
          const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
          err.code = "ENOENT";
          throw err;
        }
        const enc = typeof encoding === "string" ? encoding : encoding?.encoding;
        if (enc === "utf8") return new TextDecoder().decode(node.data);
        return node.data;
      },
      async readdir(path: string) {
        const node = get(path);
        if (node?.kind !== "dir") {
          const err = new Error(`ENOTDIR: ${path}`) as Error & { code: string };
          err.code = "ENOTDIR";
          throw err;
        }
        return [...node.children.keys()];
      },
      async unlink(path: string) {
        const key = path.replace(/\/+$/, "") || "/";
        const node = get(key);
        if (node?.kind !== "file") {
          const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
          err.code = "ENOENT";
          throw err;
        }
        nodes.delete(key);
        const parent = get(parentOf(key));
        if (parent?.kind === "dir") parent.children.delete(baseOf(key));
      },
      async rmdir(path: string) {
        const key = path.replace(/\/+$/, "") || "/";
        const node = get(key);
        if (node?.kind !== "dir") {
          const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
          err.code = "ENOENT";
          throw err;
        }
        if (node.children.size > 0) {
          const err = new Error(`ENOTEMPTY: ${path}`) as Error & { code: string };
          err.code = "ENOTEMPTY";
          throw err;
        }
        nodes.delete(key);
        const parent = get(parentOf(key));
        if (parent?.kind === "dir") parent.children.delete(baseOf(key));
      },
      async stat(path: string) {
        return statLike(path);
      },
      async lstat(path: string) {
        return statLike(path);
      },
      async readlink(_path: string) {
        const err = new Error("EINVAL: not a symlink") as Error & { code: string };
        err.code = "EINVAL";
        throw err;
      },
      async symlink(_target: string, _path: string) {
        const err = new Error("EPERM: symlinks are not supported") as Error & { code: string };
        err.code = "EPERM";
        throw err;
      },
    },
  };
}
