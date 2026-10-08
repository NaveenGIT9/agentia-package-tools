import * as vscode from 'vscode';
import { installAgentiaCommands } from './installAgentia';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('agentiaPackage.install', () => installAgentiaCommands()));
}

export function deactivate(): void {}
