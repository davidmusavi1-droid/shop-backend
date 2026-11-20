const { configureLiveZibal } = require('./zibal-live');

// A distinct customer-access switch; disabling requests keeps live callbacks
// configured for payments already in flight. Absent flags retain the admin pilot.
function publicCheckout(env = process.env) {
  return env.MOTIF_CHECKOUT_PUBLIC === 'true' &&
    env.MOTIF_ZIBAL_REQUESTS_DISABLED !== 'true' &&
    configureLiveZibal(env)?.public === true;
}
module.exports = { publicCheckout };
