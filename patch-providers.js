const fs = require('fs');
let code = fs.readFileSync('src/app/providers.tsx', 'utf8');

// Update imports
code = code.replace(
  'import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";',
  'import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";'
);

// Add states and logic to AuthProvider
code = code.replace(
  '  const [authError, setAuthError] = useState("");',
  `  const [authError, setAuthError] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState(null, '', '/');
          })
          .catch((err) => {
            setAuthError(err.message);
          });
      }
    }
  }, []);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const domain = emailInput.split('@')[1];
    if (!domain || (!domain.endsWith('.edu') && !domain.endsWith('.gov'))) {
      setAuthError("Only .edu or .gov institutional emails are allowed.");
      return;
    }
    
    const actionCodeSettings = {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true,
    };
    
    try {
      await sendSignInLinkToEmail(auth, emailInput, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', emailInput);
      setEmailSent(true);
    } catch (err: any) {
      console.error("Email sign-in error:", err);
      setAuthError(err.message || String(err));
    }
  };`
);

// Update UI
code = code.replace(
`            <p className="font-serif italic text-editorial-muted mb-8">
              Sign in to access your secure, personalized research aggregation pipeline.
            </p>
            <button 
              onClick={signIn}
              className="w-full bg-[#171717] dark:bg-black hover:bg-black dark:hover:bg-[#262626] text-white py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors"
            >
              Sign In with Google
            </button>`,
`            <p className="font-serif italic text-editorial-muted mb-8">
              Sign in to access your secure, personalized research aggregation pipeline.
            </p>
            
            {!showEmailLogin ? (
              <>
                <button 
                  onClick={signIn}
                  className="w-full bg-[#171717] dark:bg-black hover:bg-[#333] dark:hover:bg-[#262626] text-white py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors mb-4"
                >
                  Sign In with Google
                </button>
                <button 
                  onClick={() => setShowEmailLogin(true)}
                  className="w-full border-2 border-[#171717] dark:border-white text-[#171717] dark:text-white hover:bg-[#f0f0f0] dark:hover:bg-[#333] py-3 px-6 font-bold font-sans uppercase tracking-widest text-sm transition-colors"
                >
                  Sign In via Institutional Email
                </button>
              </>
            ) : emailSent ? (
              <div className="bg-green-50 border border-green-200 text-green-800 p-4 mb-4 text-sm font-sans text-left">
                <strong>Check your email!</strong><br/>
                We sent a confirmation link to <strong>{emailInput}</strong>. Click the link in the email to instantly sign in. You can safely close this window.
              </div>
            ) : (
              <form onSubmit={handleEmailSignIn} className="text-left font-sans">
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
                </button>
                <button 
                  type="button"
                  onClick={() => setShowEmailLogin(false)}
                  className="w-full text-xs underline text-editorial-muted hover:text-editorial-text uppercase tracking-widest text-center"
                >
                  &larr; Back to all login options
                </button>
              </form>
            )}`
);

fs.writeFileSync('src/app/providers.tsx', code);
