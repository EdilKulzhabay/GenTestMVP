import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models';
import { UserRole } from '../types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback';

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email']
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          const googleId = profile.id;
          const fullName = profile.displayName || profile.name?.givenName || 'User';

          let user = await User.findOne({ googleId });
          if (user) return done(null, user);

          user = await User.findOne({ email });
          if (user) {
            user.googleId = googleId;
            await user.save();
            return done(null, user);
          }

          const userName = email ? email.replace(/[@.]/g, '_').slice(0, 50) : `user_${googleId.slice(0, 12)}`;
          const existingUserName = await User.findOne({ userName });
          const uniqueUserName = existingUserName ? `${userName}_${Date.now().toString(36)}` : userName;

          user = await User.create({
            fullName,
            userName: uniqueUserName,
            email: email || undefined,
            googleId,
            role: UserRole.USER,
            testHistory: []
          });
          return done(null, user);
        } catch (err) {
          return done(err as Error, undefined);
        }
      }
    )
  );
}

passport.serializeUser((user: any, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});
