const vscode = require('vscode');

let lockPanel = null;
let isLocked = false;
let disposables = [];

function activate(context) {
    console.log('Password Lock extension is now active!');
    
    try {
        // Check if password is set
        const config = vscode.workspace.getConfiguration('passwordLock');
        const password = config.get('password', '');
        const lockOnStartup = config.get('lockOnStartup', true);
        
        // If lockOnStartup is false (disabled), ask user if they want to re-enable
        if (!lockOnStartup && !password) {
            showReEnableDialog();
        } else if (lockOnStartup) {
            if (!password) {
                // Show password setup dialog on first run
                showPasswordSetupDialog();
            } else {
                // Show lock screen if password is set
                showLockScreen();
            }
        }
        
        // Register commands
        const lockCommand = vscode.commands.registerCommand('extension.lockScreen', function () {
            const currentPassword = vscode.workspace.getConfiguration('passwordLock').get('password', '');
            if (!currentPassword) {
                showPasswordSetupDialog();
            } else {
                showLockScreen();
            }
        });
        
        const setPasswordCommand = vscode.commands.registerCommand('extension.setPassword', function () {
            showPasswordSetupDialog();
        });
        
        const disableExtensionCommand = vscode.commands.registerCommand('extension.disablePasswordLock', function () {
            showDisableExtensionDialog();
        });
        
        const enableExtensionCommand = vscode.commands.registerCommand('extension.enablePasswordLock', function () {
            showReEnableDialog();
        });
        
        context.subscriptions.push(lockCommand, setPasswordCommand, disableExtensionCommand, enableExtensionCommand);
    } catch (error) {
        console.error('Error activating extension:', error);
    }
}

async function showReEnableDialog() {
    const choice = await vscode.window.showInformationMessage(
        'Locktab Extension is currently disabled',
        {
            modal: true,
            detail: 'Would you like to enable password protection for your editor?\n\nYou will need to set a password to continue.'
        },
        'Enable & Set Password',
        'Keep Disabled'
    );
    
    if (choice === 'Enable & Set Password') {
        const config = vscode.workspace.getConfiguration('passwordLock');
        await config.update('lockOnStartup', true, vscode.ConfigurationTarget.Global);
        showPasswordSetupDialog();
    }
}

async function showPasswordSetupDialog() {
    const password = await vscode.window.showInputBox({
        prompt: 'Enter a password to lock your editor',
        password: true,
        placeHolder: 'Your secure password'
    });
    
    if (password && password.trim()) {
        const config = vscode.workspace.getConfiguration('passwordLock');
        await config.update('password', password.trim(), vscode.ConfigurationTarget.Global);
        await config.update('lockOnStartup', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Password set successfully!');
        
        // Ask if user wants to lock now
        const lockNow = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Lock editor now?'
        });
        
        if (lockNow === 'Yes') {
            showLockScreen();
        }
    }
}

async function showPasswordResetDialog() {
    const choice = await vscode.window.showWarningMessage(
        'Forgot Password?',
        {
            modal: true,
            detail: 'If you forgot your password, you can:\n\n• Disable the extension completely\n• Manually edit editor settings file\n• Uninstall and reinstall the extension\n\nFor security reasons, there is no direct password reset option.'
        },
        'Disable Extension',
        'Show Manual Instructions'
    );
    
    switch (choice) {
        case 'Disable Extension':
            await showDisableExtensionDialog();
            break;
        case 'Show Manual Instructions':
            vscode.window.showInformationMessage(
                'Manual Password Reset:\n\n1. Close editor completely\n2. Go to Settings: File > Preferences > Settings\n3. Search for "passwordLock.password"\n4. Clear the password field\n5. Restart editor\n\nOr edit settings.json file manually if editor is locked.',
                { modal: true }
            );
            break;
    }
}

async function showDisableExtensionDialog() {
    const choice = await vscode.window.showWarningMessage(
        'Disable Locktab Extension?',
        {
            modal: true,
            detail: 'This will:\n• Disable auto-lock on startup\n• Clear your saved password\n• Keep the extension installed but inactive\n\nYou can re-enable it anytime from settings or commands.'
        },
        'Yes, Disable',
        'Cancel'
    );
    
    if (choice === 'Yes, Disable') {
        const config = vscode.workspace.getConfiguration('passwordLock');
        await config.update('password', '', vscode.ConfigurationTarget.Global);
        await config.update('lockOnStartup', false, vscode.ConfigurationTarget.Global);
        
        // If currently locked, unlock
        if (isLocked && lockPanel) {
            isLocked = false;
            lockPanel.dispose();
            lockPanel = null;
        }
        
        vscode.window.showInformationMessage(
            'Locktab Extension disabled successfully!\n\nTo re-enable: Use Command Palette → "Enable Locktab" or go to Settings → "Locktab"'
        );
    }
}

function showLockScreen() {
    try {
        const config = vscode.workspace.getConfiguration('passwordLock');
        const password = config.get('password', '');
        
        if (!password) {
            vscode.window.showWarningMessage('No password set. Use "Set Password" command first.');
            return;
        }
        
        if (lockPanel) {
            lockPanel.reveal(vscode.ViewColumn.One);
            return;
        }
        
        isLocked = true;
        
        // Hide all panels and UI elements safely
        setTimeout(() => {
            try {
                vscode.commands.executeCommand('workbench.action.closePanel');
                vscode.commands.executeCommand('workbench.action.closeSidebar');
                vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
            } catch (error) {
                console.log('Could not close panels:', error);
            }
        }, 100);
        
        // Create webview panel that covers entire screen
        lockPanel = vscode.window.createWebviewPanel(
            'passwordLock',
            'Editor Lock',
            {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: false
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                enableFindWidget: false,
                enableCommandUris: false,
                localResourceRoots: []
            }
        );
        
        // Set the HTML content
        lockPanel.webview.html = getWebviewContent();
        
        // Handle messages from the webview
        lockPanel.webview.onDidReceiveMessage(
            message => {
                try {
                    switch (message.command) {
                        case 'checkPassword':
                            const currentPassword = vscode.workspace.getConfiguration('passwordLock').get('password', '');
                            if (message.password === currentPassword) {
                                // Correct password - unlock
                                isLocked = false;
                                lockPanel.dispose();
                                lockPanel = null;
                                
                                // Restore UI elements
                                setTimeout(() => {
                                    try {
                                        vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                                    } catch (error) {
                                        console.log('Could not restore sidebar:', error);
                                    }
                                }, 100);
                                
                                vscode.window.showInformationMessage('Editor unlocked successfully!');
                            } else {
                                // Wrong password - show error
                                lockPanel.webview.postMessage({ command: 'wrongPassword' });
                            }
                            return;
                        case 'resetPassword':
                            showPasswordResetDialog();
                            return;
                    }
                } catch (error) {
                    console.error('Error handling webview message:', error);
                }
            }
        );
        
        lockPanel.onDidDispose(() => {
            lockPanel = null;
            
            // Clean up disposables
            disposables.forEach(d => {
                try {
                    d.dispose();
                } catch (error) {
                    console.log('Error disposing listener:', error);
                }
            });
            disposables = [];
            
            if (isLocked) {
                // If panel is closed but still locked, show it again immediately
                setTimeout(() => {
                    if (isLocked) {
                        showLockScreen();
                    }
                }, 50);
            }
        });
        
        // Prevent user from switching tabs or opening files while locked
        try {
            // Block tab changes
            disposables.push(vscode.window.onDidChangeActiveTextEditor(() => {
                if (isLocked && lockPanel) {
                    lockPanel.reveal(vscode.ViewColumn.One, false);
                }
            }));
            
            // Block new file creation
            disposables.push(vscode.workspace.onDidOpenTextDocument(() => {
                if (isLocked && lockPanel) {
                    lockPanel.reveal(vscode.ViewColumn.One, false);
                }
            }));
        } catch (error) {
            console.log('Could not set up event listeners:', error);
        }
        
    } catch (error) {
        console.error('Error creating lock screen:', error);
        vscode.window.showErrorMessage('Failed to create lock screen: ' + error.message);
    }
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Locktab</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        html, body {
            height: 100%;
            overflow: hidden;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999999;
        }
        
        .lock-container {
            text-align: center;
            background: rgba(45, 45, 48, 0.95);
            padding: 50px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
            min-width: 400px;
            border: 2px solid #007acc;
        }
        
        .lock-icon {
            font-size: 64px;
            margin-bottom: 30px;
            color: #007acc;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        
        h1 {
            margin: 0 0 15px 0;
            font-size: 32px;
            color: #ffffff;
            font-weight: 300;
        }
        
        p {
            margin: 0 0 40px 0;
            color: #cccccc;
            font-size: 16px;
        }
        
        .password-input {
            width: 100%;
            padding: 16px;
            margin-bottom: 25px;
            border: 2px solid #3c3c3c;
            border-radius: 8px;
            background: #2d2d30;
            color: #ffffff;
            font-size: 18px;
            box-sizing: border-box;
            transition: border-color 0.3s;
        }
        
        .password-input:focus {
            outline: none;
            border-color: #007acc;
            box-shadow: 0 0 10px rgba(0, 122, 204, 0.3);
        }
        
        .unlock-button, .reset-button {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.3s;
            font-weight: 500;
            margin-bottom: 10px;
        }
        
        .unlock-button {
            background: #007acc;
            color: white;
        }
        
        .unlock-button:hover {
            background: #005a9e;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 122, 204, 0.4);
        }
        
        .reset-button {
            background: transparent;
            color: #cccccc;
            border: 1px solid #3c3c3c;
            font-size: 14px;
            padding: 12px;
        }
        
        .reset-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }
        
        .error-message {
            color: #f48771;
            font-size: 14px;
            margin-top: 15px;
            display: none;
            animation: shake 0.5s;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        .footer {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            color: #888888;
            font-size: 12px;
        }
        
        .info {
            background: rgba(0, 122, 204, 0.1);
            border: 1px solid #007acc;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 30px;
            font-size: 14px;
            color: #007acc;
        }
    </style>
</head>
<body>
    <div class="lock-container">
        <div class="lock-icon">🔒</div>
        <h1>Editor Locked</h1>
        <p>Enter your password to unlock the editor</p>
        
        <div class="info">
            Locktab is protecting your workspace. Enter your password to continue.
        </div>
        
        <form id="passwordForm">
            <input 
                type="password" 
                id="passwordInput" 
                class="password-input" 
                placeholder="Enter password..."
                autocomplete="off"
                autofocus
            />
            <button type="submit" class="unlock-button">Unlock</button>
        </form>
        
        <button type="button" class="reset-button" id="resetButton">
            Forgot Password? Help
        </button>
        
        <div id="errorMessage" class="error-message">
            Incorrect password. Please try again.
        </div>
    </div>
    
    <div class="footer">
        Developed by datkanber
    </div>

    <script>
        try {
            const vscode = acquireVsCodeApi();
            const passwordForm = document.getElementById('passwordForm');
            const passwordInput = document.getElementById('passwordInput');
            const errorMessage = document.getElementById('errorMessage');
            const resetButton = document.getElementById('resetButton');
            
            // Prevent any escape attempts
            document.addEventListener('keydown', function(e) {
                // Block common escape keys
                if (e.key === 'Escape' || e.key === 'F11' || e.key === 'F12' || 
                    (e.ctrlKey && (e.key === 'w' || e.key === 'W')) ||
                    (e.altKey && e.key === 'F4')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            });
            
            // Block right-click
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                return false;
            });
            
            passwordForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const password = passwordInput.value;
                
                if (password.trim() === '') {
                    showError();
                    return;
                }
                
                // Send password to extension
                vscode.postMessage({
                    command: 'checkPassword',
                    password: password
                });
            });
            
            resetButton.addEventListener('click', function() {
                vscode.postMessage({
                    command: 'resetPassword'
                });
            });
            
            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'wrongPassword':
                        showError();
                        passwordInput.value = '';
                        passwordInput.focus();
                        break;
                }
            });
            
            function showError() {
                errorMessage.style.display = 'block';
                passwordInput.style.borderColor = '#f48771';
                
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                    passwordInput.style.borderColor = '#3c3c3c';
                }, 3000);
            }
            
            // Keep focus on password input
            setInterval(() => {
                if (document.activeElement !== passwordInput && document.activeElement !== resetButton) {
                    passwordInput.focus();
                }
            }, 100);
            
            // Focus on password input when page loads
            passwordInput.focus();
            
        } catch (error) {
            console.error('WebView script error:', error);
        }
    </script>
</body>
</html>`;
}

function deactivate() {
    try {
        if (lockPanel) {
            lockPanel.dispose();
        }
        
        // Clean up all disposables
        disposables.forEach(d => {
            try {
                d.dispose();
            } catch (error) {
                console.log('Error disposing on deactivate:', error);
            }
        });
        disposables = [];
        
    } catch (error) {
        console.error('Error deactivating extension:', error);
    }
}

module.exports = {
    activate,
    deactivate
};
