import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f0e6] px-4">
      <SignIn appearance={{
        elements: {
          rootBox: 'mx-auto',
          card: 'bg-white shadow-lg rounded-xl border border-[#d9d0c2]',
          headerTitle: 'text-[#8b2e2e]',
          headerSubtitle: 'text-[#7a6a5a]',
          socialButtonsBlockButton: 'border-[#d9d0c2]',
          formButtonPrimary: 'bg-[#8b2e2e] hover:bg-[#6b2222] text-white',
          footerActionLink: 'text-[#8b2e2e] hover:text-[#6b2222]',
        },
      }} />
    </div>
  );
}
