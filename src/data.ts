import { Player, MatchPair } from './types';

export const INITIAL_PLAYERS: Player[] = [
  {
    id: 'p1',
    name: 'Alex Rivera',
    rating: 'NTRP 4.5',
    ratingValue: 4.5,
    points: 450,
    winRate: '88%',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCZluK_1VgaXieH5wJR9JLJDpp7KYV-5PUSzLtWwfJHhz7ML_ediF09O4RTsWa-UFV1fZHerSjYshtiyU2hSwK8CXfkEL5UOBqkUhx_QkH8b4t7C5nVu3qjOzgoBFofFoT-l5E-23MlNihGhv28UQnqf1jTKOaHmXpUV4OC6bGO4sRmqScB2NLFAZzwITYTrxysqyTri2rIdEB55jlI392VTCb6lv0gzYYIIfhSjrS3tBVvNL4qYMHLYKDrUfPJFZgegiV4Q6luQ',
    group: 'A',
    winStreak: 5
  },
  {
    id: 'p2',
    name: 'Sarah Chen',
    rating: 'NTRP 4.0',
    ratingValue: 4.0,
    points: 420,
    winRate: '82%',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDy4lHHFvuK5HIASvUq0id5XrMQJ4dD4S-uoOTnbRuRM4vQmQZstZqq8wFUlxunAYNDTMkXwkLSGrtcoS1TCU1oph2nsXotbg7aIhCSyt69xw8wLC9oXSDg8vevGuK-OFZ1iY9hmHdTLuRDz3uvZxaNAsDYOnBqMu-1Yh6tYpSkhW3MTMTCVwjTW4iVK5MBrXNMJ8Ts-leBgvf716icljufq5T1tIpOKQUdKPIwEgzzkYkcLWzDy5qtlGW8Z7ceL5FH4w66jxExww',
    group: 'A',
    winStreak: 3
  },
  {
    id: 'p3',
    name: 'Mike Johnson',
    rating: 'NTRP 4.0',
    ratingValue: 4.0,
    points: 390,
    winRate: '75%',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB8xu3_i9eC8wH6uitX9cZVoMmF0ePihacWl1ky877I6yZl7S9cYDgSguM3JQMUUvbxGBy1eYJgW6BkIu9VqF3NIYkcCxYSbHByCYfIznR6zEBoYb9fKQBmLfGbE8Xsgr_P0l9cTxDuq2Oewv2nUUOqYUZrNgFljsDb3DpB_7UlExHi84QkXjWEQSFHIqG8euH0tG3Om806BdaKE5sSY4eJUHciW3znr3WVYGq1ICtUVAdnltH6Kobx_5AWDxQep1dPmUn5sr1kww',
    group: 'A',
    winStreak: 2
  },
  {
    id: 'p4',
    name: 'Marcus Chen',
    rating: 'UTR 9',
    ratingValue: 9.0,
    points: 2450,
    winRate: '88%',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9pyI9HAW1X8bmks5e-lUVOj268XUFNlQY0iFWL6jXFnrYgFYqtmljZ1FGlxWyYY3E_EtDuqXFGiPfm5VaP2gDJf3ePOow0rvKvFtCSSk5elKLuXgGg1omchmVTAdXIpsOB7LvIIagwZ-Q7-t1nqvmvruZBwJSgTpB5u5wc6ri9alrsRuFCnEkixbUKv9P3hPeKq55gV3wl0kebVjRmN3Sh6ok1h_oMtAoMUaYfrWgB3Mm4yK7GaK8vfwpUdwzeqZOFwlJFMk8pA',
    group: 'A',
    winStreak: 8
  },
  {
    id: 'p5',
    name: 'James Peterson',
    rating: 'UTR 8',
    ratingValue: 8.0,
    points: 2120,
    winRate: '75%',
    initials: 'JP',
    group: 'A',
    winStreak: 4
  },
  {
    id: 'p6',
    name: 'David Lee',
    rating: 'NTRP 3.0',
    ratingValue: 3.0,
    points: 210,
    winRate: '64%',
    group: 'B',
    winStreak: 1
  },
  {
    id: 'p7',
    name: 'Emma Davis',
    rating: 'NTRP 3.0',
    ratingValue: 3.0,
    points: 195,
    winRate: '58%',
    group: 'B',
    winStreak: 0
  },
  {
    id: 'p8',
    name: 'Tom Silva',
    rating: 'UTR 7',
    ratingValue: 7.0,
    points: 1650,
    winRate: '60%',
    initials: 'TS',
    group: 'B',
    winStreak: 2
  },
  {
    id: 'p9',
    name: 'Alex Mercer',
    rating: 'UTR 9',
    ratingValue: 9.0,
    points: 1250,
    winRate: '85%',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBcyAmzqRqssCxv6Wb0DGX53zwP7kdvMwEjjmkZzerh2snAujbYmqFcZOR-H6AOsSa3A6uR8GZ94x84GVCjmw6-ymON_aMteTO1cC9hsUtcB46zqQ-AkbB77f50dm7L-98nt68VjlMNoz3vplkL7H4UzNR5252POaehcS-vS9KJL2bUoOymFDZK6x0DUPkDnqY0ccGiUzsyCbjqzYRppzf7ocnRrsJk35wG0pKoHhpkBoqhj1XHMpDjFApF09ZyiuJV_2Z7ZDcA5A',
    group: 'A',
    winStreak: 5
  },
  {
    id: 'p10',
    name: 'Sarah Lin',
    rating: 'UTR 8',
    ratingValue: 8.0,
    points: 1180,
    winRate: '79%',
    initials: 'SL',
    group: 'A',
    winStreak: 2
  },
  {
    id: 'p11',
    name: 'David Kim',
    rating: 'UTR 7',
    ratingValue: 7.0,
    points: 1120,
    winRate: '71%',
    initials: 'DK',
    group: 'B',
    winStreak: 0
  },
  {
    id: 'p12',
    name: 'Michael Wang',
    rating: 'NTRP 4.0',
    ratingValue: 4.0,
    points: 380,
    winRate: '69%',
    group: 'A',
    winStreak: 1
  }
];

export const INITIAL_MATCHES: MatchPair[] = [
  {
    id: 'm1',
    playerA: INITIAL_PLAYERS[0], // Alex Rivera
    playerB: INITIAL_PLAYERS[5], // David Lee
    scoreA: 6,
    scoreB: 4,
    court: 'Court 1',
    status: 'Completed'
  },
  {
    id: 'm2',
    playerA: INITIAL_PLAYERS[1], // Sarah Chen
    playerB: INITIAL_PLAYERS[6], // Emma Davis
    scoreA: 4,
    scoreB: 6,
    court: 'Court 2',
    status: 'Completed'
  }
];
