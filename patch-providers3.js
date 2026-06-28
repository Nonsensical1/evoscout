const fs = require('fs');
let code = fs.readFileSync('src/app/providers.tsx', 'utf8');

// Add states
code = code.replace(
  `const [showEmailLogin, setShowEmailLogin] = useState(false);`,
  `const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);`
);

// Update isSignInWithEmailLink logic
code = code.replace(
  `.then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState(null, '', '/');
          })`,
  `.then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState(null, '', '/');
            
            // Check if user already has a password provider
            const hasPassword = result.user.providerData.some(p => p.providerId === 'password');
            if (!hasPassword) {
              setPendingUser(result.user);
              setShowSetPassword(true);
            }
          })`
);

// Add Password sign in function
code = code.replace(
  `const handleEmailSignIn = async (e: React.FormEvent) => {`,
  `const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, emailInput, passwordInput);
    } catch (err: any) {
      setAuthError(err.message || String(err));
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!pendingUser) return;
    try {
      await updatePassword(pendingUser, passwordInput);
      setShowSetPassword(false);
      setPendingUser(null);
    } catch (err: any) {
      setAuthError(err.message || String(err));
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {`
);

// Update Form JSX
code = code.replace(
  `<form onSubmit={handleEmailSignIn} className="text-left font-sans">
                <label className="block text-xs uppercase tracking-wider font-bold mb-2 text-editorial-text">
                  Institutional Email (.edu or .gov)
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@university.edu"
                  required
                  className="w-full border-2 border-editorial-border p-3 mb-4 bg-transparent text-editorial-text focus:outline-none focus:border-black dark:focus:border-white"
                />
                <button 
                  type="submit"
                  className="w-full bg-[#171717] dark:bg-black hover:bg-[#333] dark:hover:bg-[#262626] text-white py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors mb-4"
                >
                  Send Login Link
                </button>`,
  `{showSetPassword ? (
              <form onSubmit={handleSetPassword} className="text-left font-sans">
                <h2 className="text-xl font-serif font-bold mb-4 text-editorial-text">Set a Permanent Password</h2>
                <p className="text-xs text-editorial-muted mb-4">You've successfully verified your institutional email! Set a password now so you can log in instantly next time without waiting for an email link.</p>
                <label className="block text-xs uppercase tracking-wider font-bold mb-2 text-editorial-text">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full border-2 border-editorial-border p-3 mb-4 bg-transparent text-editorial-text focus:outline-none focus:border-black dark:focus:border-white"
                />
                <button 
                  type="submit"
                  className="w-full bg-green-700 hover:bg-green-800 text-white py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors mb-2"
                >
                  Save Password & Continue
                </button>
                <button 
                  type="button"
                  onClick={() => { setShowSetPassword(false); setPendingUser(null); }}
                  className="w-full text-xs underline text-editorial-muted hover:text-editorial-text uppercase tracking-widest text-center"
                >
                  Skip for now
                </button>
              </form>
            ) : (
              <form onSubmit={handlePasswordSignIn} className="text-left font-sans">
                <label className="block text-xs uppercase tracking-wider font-bold mb-2 text-editorial-text">
                  Institutional Email (.edu or .gov)
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@university.edu"
                  required
                  className="w-full border-2 border-editorial-border p-3 mb-4 bg-transparent text-editorial-text focus:outline-none focus:border-black dark:focus:border-white"
                />
                <label className="block text-xs uppercase tracking-wider font-bold mb-2 text-editorial-text">
                  Password (Leave blank if you don't have one)
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border-2 border-editorial-border p-3 mb-4 bg-transparent text-editorial-text focus:outline-none focus:border-black dark:focus:border-white"
                />
                
                <div className="flex gap-2 mb-4">
                  <button 
                    type="submit"
                    className="flex-1 bg-[#171717] dark:bg-black hover:bg-[#333] dark:hover:bg-[#262626] text-white py-3 px-2 font-bold font-sans uppercase tracking-widest text-xs transition-colors"
                  >
                    Sign In
                  </button>
                  <button 
                    type="button"
                    onClick={handleEmailSignIn}
                    className="flex-1 bg-white dark:bg-[#222] border-2 border-[#171717] dark:border-white text-[#171717] dark:text-white hover:bg-gray-100 dark:hover:bg-[#333] py-3 px-2 font-bold font-sans uppercase tracking-widest text-[10px] sm:text-xs transition-colors"
                  >
                    Send Magic Link
                  </button>
                </div>`
);

fs.writeFileSync('src/app/providers.tsx', code);
