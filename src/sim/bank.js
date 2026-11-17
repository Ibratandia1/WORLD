// Banque : épargne (à l'abri des pickpockets), intérêts, prêts. Les gestes sont des actions (actions.js) :
// deposit, withdraw, take_loan, repay_loan — joueur et PNJ pareil. Ce module fait le bilan du lundi.
// Événement émis : bankStatement (intérêts versés, mensualité du prêt)

export const SAVINGS_RATE = 0.005; // 0,5 % par semaine sur l'épargne
export const LOAN_RATE = 0.02;     // 2 % par semaine sur le reste à rembourser
export const LOAN_STEP = 500;      // montant d'un prêt
export const LOAN_MAX = 1500;      // plafond de l'endettement
export const LOAN_WEEKLY = l => Math.min(l, Math.round(40 + l * 0.1)); // remboursement automatique du lundi

export class Bank {
  constructor(world) {
    this.w = world;
    world.bank = this;
    this.paid = 0; // intérêts versés depuis le début (pour le journal)
    world.on('newDay', () => { if (world.weekday === 0) this.weekly(); });
  }

  weekly() {
    const w = this.w;
    for (const a of w.actors) {
      let interest = 0, paid = 0, loanInterest = 0;
      if (a.bank > 0) {
        interest = Math.round(a.bank * SAVINGS_RATE * 100) / 100;
        a.bank += interest; this.paid += interest;
      }
      if (a.loan > 0) {
        loanInterest = Math.round(a.loan * LOAN_RATE);
        a.loan += loanInterest;
        const due = LOAN_WEEKLY(a.loan);
        // prélevé sur l'épargne d'abord, puis sur l'argent liquide (peut mettre à découvert)
        const fromBank = Math.min(due, Math.max(0, a.bank || 0));
        a.bank = (a.bank || 0) - fromBank;
        a.money -= due - fromBank;
        a.loan -= due; paid = due;
        if (a.loan <= 0) a.loan = 0;
      }
      if (interest || paid) w.emit('bankStatement', { actor: a, interest, paid, loanInterest, loan: a.loan || 0, bank: a.bank || 0 });
    }
  }

  snapshot() { return { paid: this.paid }; }
  restore(s) { if (s) this.paid = s.paid || 0; }
}
