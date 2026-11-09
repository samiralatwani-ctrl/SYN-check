# إجابات نماذج الخصوصية في المتجرين

## Google Play — Data safety
| السؤال | الإجابة |
|---|---|
| Does your app collect or share any of the required user data types? | Yes (collects; does not share) |
| Is all user data encrypted in transit? | Yes (HTTPS) |
| Do you provide a way for users to request that their data be deleted? | Yes (in-app: Settings → Delete my data) |
| **Photos and videos → Photos** | Collected: **No** (processed ephemerally: sent for real-time reading, not stored) |
| **App activity → Other user-generated content** (reports) | Collected: Yes · Optional · Purpose: App functionality · Not shared |
| **App info and performance → Diagnostics** (usage log) | Collected: Yes · Required for label reading · Purpose: App functionality, Fraud prevention (rate limit) · 30 days |
| **Device or other IDs** (random anonymous ID) | Collected: Yes · Purpose: App functionality |
| Personal info (name, email, phone), Location, Financial, Contacts, Health | **Not collected** |

ملاحظة: إرسال الصورة إلى Anthropic معالجة نيابة عنا (service provider)، وليس "مشاركة" بتعريف Google.

## Apple — App Privacy (Nutrition label)
| النوع | الحالة |
|---|---|
| User ID (anonymous) | Collected · App Functionality · **Not linked** to identity · No tracking |
| Other User Content (reports) | Collected · App Functionality · Not linked · No tracking |
| Photos | **Not collected** (not retained beyond real-time processing) |
| Tracking | **No** |

ملف `PrivacyInfo.xcprivacy` يُولَّد من `app.json` (`ios.privacyManifests`) بالقيم نفسها.
