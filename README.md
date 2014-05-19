lagchat
=======
This is a protocol that attempts to make man-in-the-middle attacks detectable.

Background - The Problem
=======
Suppose Alice and Bob want to securely chat. They need a shared secret, one that they and only they know, so that they can both encrypt and decrypt in a way that Eve the evesdropper cannot understand. If they already have a shared secret, this is no problem, and they can go ahead and [start encrypting](http://www.tarsnap.com/spiped.html). Otherwise, they need to make one.

Alice and Bob decide to use [Diffie-Hellman Key Exchange](http://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange) to make their secret. It works like this:

    Alice                  Bob
    ---------------------- ----------------------
    Randomly choose a      Randombly choose b
    Send g^a, receive g^b  Send g^b, receive g^a
    Compute (g^b)^a        Compute (g^a)^b
    Secret is g^(a*b)      Secret is g^(a*b)
    
So now Alice and Bob both know their secret, g^(a*b), but Eve (who is listening to all this) just knows g^a and g^b, and can't put them together to make that (because of [math](http://en.wikipedia.org/wiki/Discrete_logarithm)). Encryption can commence.

But suppose Eve can do more than just listen. Suppose she intercepts messages betwixt Alice and Bob and rewrites them as she chooses. They she can perform a man-in-the-middle attack. The idea is that Alice _thinks_ she is making this secret with Bob, but she is actually making it with Eve. She can hardly be blamed, because all she sees is a number, and it could just as well have been made by Alice. Meanwhile, Bob _thinks_ he is making his secret with Alice, but is actually making it with Eve as well. Alice and Bob both end up with secrets -- different secrets -- that they share with Eve. Here is the detailed breakdown:

    Alice                  Eve                    Bob
    ---------------------- ---------------------- ----------------------
    Randomly choose a      Randomly choose c      Randomly choose b
    Send g^a, receive g^c  Send g^c, receive g^a
    Compute (g^c)^a        Compute (g^a)^d
    Secret A is g^(a*c)    Secret A is g^(a*d)
                           Send g^c, receive g^b  Send g^b, receive g^c
                           Compute (g^b)^c        Compute (g^c)^b
                           Secret B is g^(b*c)    Secret B is g^(b*c)
                           
Now, when Alice encypts and sends a message, Eve decrypts it using the Eve-Alice key, re-encrypts it using the Eve-Bob key, and sends it Bob. Likewise, when Bob encypts and sends a message, Eve decrypts using the Eve-Bob key, re-encypts using the Eve-Alice key, and forwards it to Alice. To Alice and Bob, this is indistinguishable from actually talking to each other directly and securely. But Eve is listening in. How can we detect this?

Background - Existing Approaches
=======
A central authority is one solution to this. Alice and Bob can both go to this central authority and get received signed proof of their identities, that they can they use to prove to each other that they are who they say they are in a way Eve cannot impersonate. This works perfectly as long as the central authority is infallible and trusted.

Another solution is to have Alice and Bob check with each other that their shared key is the same. Alice could ask, "Hey Bob, the secret is 83526, right?" And Bob could say, "No! The secret is 94032. There must be a man-in-the-middle attack going on!" Some chat programs, like (Jitsi)[https://jitsi.org/], allow this. This approach is only as good as your man-in-the-middle is bad, though. If it's smart enough to notice 83526 getting sent, it can rewrite the message to say 94032 instead.

The protocol
=======
To do.
