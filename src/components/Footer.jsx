import facebookLogo from '../assets/fb-logo.jpg';
import youtubeLogo from '../assets/yt-logo.jpg';
import instagramLogo from '../assets/ig-logo.jpg';

const SOCIALS = [
    {
        name: 'Facebook',
        href: 'https://www.facebook.com/share/1CcQQwiwAv/',
        logo: facebookLogo,
    },
    {
        name: 'Instagram',
        href: 'https://www.instagram.com/faithag.nungua/',
        logo: instagramLogo,
    },
    {
        name: 'YouTube',
        href: 'https://youtube.com/@faithag.nungua?si=5La0hgy-vJTkoOEB',
        logo: youtubeLogo,
    },
];

export default function Footer() {
    return (
        <footer className="app-footer">
            <p className="footer-label">Follow us</p>
            <div className="social-links">
                {SOCIALS.map((s) => (
                    <a
                        key={s.name}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.name}
                        aria-label={s.name}
                    >
                        <img src={s.logo} alt={s.name} />
                    </a>
                ))}
            </div>
        </footer>
    );
}